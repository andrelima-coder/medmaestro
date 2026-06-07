import { createServiceClient } from '@/lib/supabase/service'
import { startOrResumeAttempt } from './actions'
import { ProvaRuntime } from './prova-runtime'

export const metadata = { title: 'Simulado — MedMaestro' }

type QuestionRow = {
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
  } | null
}

export default async function SimuladoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: campaignId } = await params

  const started = await startOrResumeAttempt(campaignId)
  if (!started.ok) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-lg font-bold text-foreground">Simulado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{started.error}</p>
      </div>
    )
  }

  const { attemptId, remaining } = started.data
  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('name, simulado_id, pause_allowed')
    .eq('id', campaignId)
    .single()

  const { data: rows } = await service
    .from('simulado_questions')
    .select(
      'position, questions(id, question_no, stem, alternative_a, alternative_b, alternative_c, alternative_d, alternative_e)'
    )
    .eq('simulado_id', campaign?.simulado_id)
    .order('position', { ascending: true })

  const questions = ((rows ?? []) as unknown as QuestionRow[])
    .filter((r) => r.questions)
    .map((r) => {
      const q = r.questions!
      return {
        id: q.id,
        number: q.question_no ?? r.position,
        stem: q.stem ?? '',
        alternatives: {
          A: q.alternative_a ?? '',
          B: q.alternative_b ?? '',
          C: q.alternative_c ?? '',
          D: q.alternative_d ?? '',
          E: q.alternative_e ?? '',
        } as Record<string, string>,
      }
    })

  const { data: saved } = await service
    .from('question_attempts')
    .select('question_id, selected_alt, is_saved')
    .eq('attempt_id', attemptId)

  const savedMap: Record<string, { alt: string | null; locked: boolean }> = {}
  for (const s of saved ?? []) {
    savedMap[s.question_id] = { alt: s.selected_alt, locked: !!s.is_saved }
  }

  return (
    <ProvaRuntime
      campaignId={campaignId}
      campaignName={campaign?.name ?? 'Simulado'}
      attemptId={attemptId}
      initialRemaining={remaining}
      pauseAllowed={!!campaign?.pause_allowed}
      questions={questions}
      saved={savedMap}
    />
  )
}
