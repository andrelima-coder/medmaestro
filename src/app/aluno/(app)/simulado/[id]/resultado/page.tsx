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
      'position, questions(id, question_no, stem, alternative_a, alternative_b, alternative_c, alternative_d, alternative_e, correct_answer)'
    )
    .eq('simulado_id', campaign?.simulado_id)
    .order('position', { ascending: true })

  type QRow = {
    position: number
    questions: {
      id: string
      question_no: number | null
      stem: string | null
      alternative_a: string | null
      alternative_b: string | null
      alternative_c: string | null
      alternative_d: string | null
      alternative_e: string | null
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
      .select('question_id, content')
      .in('question_id', ids)
      .eq('is_published', true)
    for (const c of comments ?? []) {
      if (!commentByQ[c.question_id]) commentByQ[c.question_id] = c.content
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
    return {
      id: q.id,
      number: q.question_no ?? r.position,
      selected,
      // verde/vermelho só quando a nota/gabarito é liberada.
      correct: showScore ? isCorrect : null,
      correctAnswer: showScore ? q.correct_answer : null,
      stem: allowReview ? (q.stem ?? '') : null,
      alternatives: allowReview
        ? {
            A: q.alternative_a ?? '',
            B: q.alternative_b ?? '',
            C: q.alternative_c ?? '',
            D: q.alternative_d ?? '',
            E: q.alternative_e ?? '',
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
