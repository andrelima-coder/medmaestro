import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getErrorCardImages } from '@/lib/aluno/estudo'
import { ResultadoClient, type ResultQuestion, type ModulePerf } from '../resultado-client'

export const metadata = { title: 'Resultado — MedMaestro' }

export default async function ResultadoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/aluno/login')

  const service = createServiceClient()

  const { data: attempt } = await service
    .from('simulado_attempts')
    .select('id, status, was_paused')
    .eq('user_id', user.id)
    .eq('campaign_id', campaignId)
    .maybeSingle()

  if (!attempt) redirect(`/aluno/simulado/${campaignId}`)
  if (attempt.status === 'em_andamento') redirect(`/aluno/simulado/${campaignId}`)

  const { data: campaign } = await service
    .from('campaigns')
    .select('name, simulado_id, releases, live_url, live_at')
    .eq('id', campaignId)
    .single()

  const releases = (campaign?.releases ?? {}) as {
    nota_gabarito?: boolean
    comentarios_mode?: string
    comentarios_release_at?: string | null
    comentarios_release_until?: string | null
    revisao?: boolean
  }
  const showScore = !!releases.nota_gabarito
  const allowReview = !!releases.revisao

  // Janela de comentários: imediato ou por data de início, com fim opcional.
  const now = Date.now()
  let commentsReleased =
    releases.comentarios_mode === 'imediato' ||
    (releases.comentarios_mode === 'data' &&
      !!releases.comentarios_release_at &&
      now >= new Date(releases.comentarios_release_at).getTime())
  if (
    commentsReleased &&
    releases.comentarios_release_until &&
    now > new Date(releases.comentarios_release_until).getTime()
  ) {
    commentsReleased = false
  }

  // Comentários retidos: diz ao participante quando/onde eles aparecem
  // (gancho da live), em vez de simplesmente sumir com eles.
  const fmtBR = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    })
  let comentariosAviso: string | null = null
  if (!commentsReleased) {
    if (
      releases.comentarios_mode === 'data' &&
      releases.comentarios_release_at &&
      now < new Date(releases.comentarios_release_at).getTime()
    ) {
      comentariosAviso = `Os comentários das questões serão liberados em ${fmtBR(releases.comentarios_release_at)}.`
    } else if (releases.comentarios_mode === 'oculto' && (campaign?.live_url || campaign?.live_at)) {
      comentariosAviso = 'Os comentários das questões serão apresentados na correção ao vivo.'
    }
  }

  // Questões do molde.
  const { data: rows } = await service
    .from('simulado_questions')
    .select(
      'position, questions(id, question_number, stem, alternatives, correct_answer)'
    )
    .eq('simulado_id', campaign?.simulado_id)
    .order('position', { ascending: true })

  type QRow = {
    position: number
    questions: {
      id: string
      question_number: number | null
      stem: string | null
      alternatives: Record<string, string> | null
      correct_answer: string | null
    } | null
  }
  const qrows = ((rows ?? []) as unknown as QRow[]).filter((r) => r.questions)
  const questionIds = qrows.map((r) => r.questions!.id)

  // Respostas do aluno.
  const { data: myAns } = await service
    .from('question_attempts')
    .select('question_id, selected_alt')
    .eq('attempt_id', attempt.id)
  const selectedByQ: Record<string, string | null> = {}
  for (const a of myAns ?? []) selectedByQ[a.question_id] = a.selected_alt

  // Agregados da campanha (somente provas ENTREGUES): distribuição por
  // alternativa e média geral dos participantes.
  const distByQ: Record<string, Record<string, number>> = {}
  const totalByQ: Record<string, number> = {}
  let mediaGeral: { pct: number; participantes: number } | null = null
  if (allowReview || showScore) {
    // Tempo esgotado = entrega com o que foi feito: expirados contam na média
    // e na distribuição, como numa prova real.
    const { data: finished } = await service
      .from('simulado_attempts')
      .select('id')
      .eq('campaign_id', campaignId)
      .in('status', ['entregue', 'expirado'])
    const ids = (finished ?? []).map((a) => a.id)
    if (ids.length > 0) {
      const { data: allAns } = await service
        .from('question_attempts')
        .select('attempt_id, question_id, selected_alt')
        .in('attempt_id', ids)

      const correctMap: Record<string, string | null> = {}
      for (const r of qrows) correctMap[r.questions!.id] = r.questions!.correct_answer

      const correctByAttempt: Record<string, number> = {}
      for (const a of allAns ?? []) {
        if (!a.selected_alt) continue
        distByQ[a.question_id] ??= {}
        distByQ[a.question_id][a.selected_alt] =
          (distByQ[a.question_id][a.selected_alt] ?? 0) + 1
        totalByQ[a.question_id] = (totalByQ[a.question_id] ?? 0) + 1
        const corr = correctMap[a.question_id]
        if (corr && a.selected_alt === corr) {
          correctByAttempt[a.attempt_id] = (correctByAttempt[a.attempt_id] ?? 0) + 1
        }
      }
      if (showScore && qrows.length > 0) {
        const scores = ids.map((id) =>
          Math.round(((correctByAttempt[id] ?? 0) / qrows.length) * 100)
        )
        mediaGeral = {
          pct: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
          participantes: scores.length,
        }
      }
    }
  }

  // Comentários (curadoria pode rejeitar; rejeitado nunca chega ao participante).
  const commentByQ: Record<string, string> = {}
  if (commentsReleased && questionIds.length > 0) {
    const { data: comments } = await service
      .from('question_comments')
      .select('question_id, content, comment_type')
      .in('question_id', questionIds)
      .neq('status', 'rejected')
      .order('comment_type', { ascending: true })
    for (const c of comments ?? []) {
      // prioriza explicacao; não sobrescreve uma explicacao já escolhida
      if (!commentByQ[c.question_id] || c.comment_type === 'explicacao') {
        commentByQ[c.question_id] = c.content
      }
    }
  }

  // Imagens das questões (revisão fica incompleta sem as figuras).
  const imagesByQ = allowReview
    ? await getErrorCardImages(service, questionIds)
    : new Map<string, { url: string; scope: string }[]>()

  // Módulo de cada questão (desempenho por área).
  const moduleByQ: Record<string, string> = {}
  if (showScore && questionIds.length > 0) {
    const { data: qt } = await service
      .from('question_tags')
      .select('question_id, tags!inner(label, dimension)')
      .in('question_id', questionIds)
      .eq('tags.dimension', 'modulo')
    for (const r of (qt ?? []) as unknown as {
      question_id: string
      tags: { label: string } | null
    }[]) {
      if (r.tags?.label && !moduleByQ[r.question_id]) moduleByQ[r.question_id] = r.tags.label
    }
  }

  // Monta as questões (sanitizadas por gating) e calcula o score.
  let correct = 0
  const total = qrows.length
  const modAgg: Record<string, { correct: number; total: number }> = {}
  const questions: ResultQuestion[] = qrows.map((r) => {
    const q = r.questions!
    const selected = selectedByQ[q.id] ?? null
    const isCorrect = selected != null && q.correct_answer != null && selected === q.correct_answer
    if (isCorrect) correct++

    if (showScore) {
      const mod = moduleByQ[q.id] ?? 'Outros'
      modAgg[mod] ??= { correct: 0, total: 0 }
      modAgg[mod].total++
      if (isCorrect) modAgg[mod].correct++
    }

    const distTotal = totalByQ[q.id] ?? 0
    const alt = (q.alternatives ?? {}) as Record<string, string>
    return {
      id: q.id,
      number: q.question_number ?? r.position,
      selected,
      // verde/vermelho só quando a nota/gabarito é liberada.
      correct: showScore ? isCorrect : null,
      correctAnswer: showScore ? q.correct_answer : null,
      stem: allowReview ? (q.stem ?? '') : null,
      alternatives: allowReview
        ? {
            A: alt.A ?? '',
            B: alt.B ?? '',
            C: alt.C ?? '',
            D: alt.D ?? '',
            E: alt.E ?? '',
          }
        : null,
      comment: commentsReleased ? (commentByQ[q.id] ?? null) : null,
      distribution:
        allowReview && distTotal > 0
          ? { counts: distByQ[q.id] ?? {}, total: distTotal }
          : null,
      images: allowReview ? (imagesByQ.get(q.id) ?? []) : [],
    }
  })

  const modules: ModulePerf[] | null = showScore
    ? Object.entries(modAgg)
        .map(([label, v]) => ({
          label,
          correct: v.correct,
          total: v.total,
          pct: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    : null

  const completedSingleRun = attempt.status === 'entregue' && !attempt.was_paused
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0

  // Persiste o resultado (idempotente). `finished_at` marca a PRIMEIRA chegada
  // aqui — é critério de desempate do ranking e não pode ser regravado a cada
  // visita à página.
  const { data: prevResult } = await service
    .from('attempt_results')
    .select('finished_at')
    .eq('attempt_id', attempt.id)
    .maybeSingle()
  await service
    .from('attempt_results')
    .upsert(
      {
        attempt_id: attempt.id,
        score: showScore ? pct : null,
        completed_single_run: completedSingleRun,
        finished_at: prevResult?.finished_at ?? new Date().toISOString(),
      },
      { onConflict: 'attempt_id' }
    )

  return (
    <ResultadoClient
      campaignName={campaign?.name ?? 'Simulado'}
      confetti={attempt.status === 'entregue'}
      singleRun={completedSingleRun}
      score={showScore ? { correct, total, pct } : null}
      media={mediaGeral}
      modules={modules}
      allowReview={allowReview}
      liveUrl={campaign?.live_url ?? null}
      comentariosAviso={comentariosAviso}
      questions={questions}
    />
  )
}
