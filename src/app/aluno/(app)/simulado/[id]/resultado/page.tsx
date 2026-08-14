import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ResultadoClient, type ResultQuestion } from '../resultado-client'

export const metadata = { title: 'Resultado — MedMaestro' }

const MIN_DISTRIBUTION = 30 // volume mínimo por questão para exibir distribuição

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
    revisao?: boolean
  }
  const showScore = !!releases.nota_gabarito
  const allowReview = !!releases.revisao
  const commentsReleased =
    releases.comentarios_mode === 'imediato' ||
    (releases.comentarios_mode === 'data' &&
      !!releases.comentarios_release_at &&
      Date.now() >= new Date(releases.comentarios_release_at).getTime())

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

  // Respostas do aluno.
  const { data: myAns } = await service
    .from('question_attempts')
    .select('question_id, selected_alt')
    .eq('attempt_id', attempt.id)
  const selectedByQ: Record<string, string | null> = {}
  for (const a of myAns ?? []) selectedByQ[a.question_id] = a.selected_alt

  // Distribuição agregada da campanha (para volume mínimo).
  let distByQ: Record<string, Record<string, number>> = {}
  let totalByQ: Record<string, number> = {}
  if (allowReview) {
    const { data: attemptIds } = await service
      .from('simulado_attempts')
      .select('id')
      .eq('campaign_id', campaignId)
    const ids = (attemptIds ?? []).map((a) => a.id)
    if (ids.length > 0) {
      const { data: allAns } = await service
        .from('question_attempts')
        .select('question_id, selected_alt')
        .in('attempt_id', ids)
      for (const a of allAns ?? []) {
        if (!a.selected_alt) continue
        distByQ[a.question_id] ??= {}
        distByQ[a.question_id][a.selected_alt] = (distByQ[a.question_id][a.selected_alt] ?? 0) + 1
        totalByQ[a.question_id] = (totalByQ[a.question_id] ?? 0) + 1
      }
    }
  }

  // Comentários publicados (se liberados).
  const commentByQ: Record<string, string> = {}
  if (commentsReleased) {
    const ids = qrows.map((r) => r.questions!.id)
    const { data: comments } = await service
      .from('question_comments')
      .select('question_id, content, comment_type')
      .in('question_id', ids)
      .eq('status', 'published')
      .order('comment_type', { ascending: true })
    for (const c of comments ?? []) {
      // prioriza explicacao; não sobrescreve uma explicacao já escolhida
      if (!commentByQ[c.question_id] || c.comment_type === 'explicacao') {
        commentByQ[c.question_id] = c.content
      }
    }
  }

  // Monta as questões (sanitizadas por gating) e calcula o score.
  let correct = 0
  const total = qrows.length
  const questions: ResultQuestion[] = qrows.map((r) => {
    const q = r.questions!
    const selected = selectedByQ[q.id] ?? null
    const isCorrect = selected != null && q.correct_answer != null && selected === q.correct_answer
    if (isCorrect) correct++

    const showDist = allowReview && (totalByQ[q.id] ?? 0) >= MIN_DISTRIBUTION
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
      distribution: showDist
        ? { counts: distByQ[q.id] ?? {}, total: totalByQ[q.id] ?? 0 }
        : null,
    }
  })

  const completedSingleRun = attempt.status === 'entregue' && !attempt.was_paused
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0

  // Persiste o resultado (idempotente).
  await service
    .from('attempt_results')
    .upsert(
      {
        attempt_id: attempt.id,
        score: showScore ? pct : null,
        completed_single_run: completedSingleRun,
        finished_at: new Date().toISOString(),
      },
      { onConflict: 'attempt_id' }
    )

  return (
    <ResultadoClient
      campaignName={campaign?.name ?? 'Simulado'}
      confetti={completedSingleRun}
      score={showScore ? { correct, total, pct } : null}
      allowReview={allowReview}
      liveUrl={campaign?.live_url ?? null}
      questions={questions}
    />
  )
}
