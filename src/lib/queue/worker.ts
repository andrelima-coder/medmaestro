import { createServiceClient } from '@/lib/supabase/service'

export type Job = {
  id: string
  type: string
  exam_id: string | null
  question_id: string | null
  payload: Record<string, unknown>
  status: string
  attempts: number
  error: string | null
  created_at: string
  updated_at: string | null
  retry_after: string | null
}

export type JobHandler = (job: Job) => Promise<void>

const handlers = new Map<string, JobHandler>()

export function registerHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler)
}

/**
 * Processa um batch de jobs com concorrência máxima D12.
 * Usa claim_jobs() para claim atômico (SKIP LOCKED).
 */
export async function processBatch(concurrency = 5): Promise<{
  processed: number
  errors: number
  skipped: number
}> {
  const supabase = createServiceClient()

  const { data: jobs, error: claimError } = await supabase.rpc('claim_jobs', {
    p_limit: concurrency,
  })

  if (claimError) {
    console.error('[worker] claim_jobs error:', claimError.message)
    return { processed: 0, errors: 0, skipped: 0 }
  }

  if (!jobs || jobs.length === 0) {
    return { processed: 0, errors: 0, skipped: 0 }
  }

  let processed = 0
  let errors = 0
  let skipped = 0

  await Promise.allSettled(
    (jobs as Job[]).map(async (job) => {
      const handler = handlers.get(job.type)

      if (!handler) {
        await supabase
          .from('jobs')
          .update({ status: 'pending', attempts: job.attempts - 1 })
          .eq('id', job.id)
        skipped++
        return
      }

      try {
        await handler(job)

        await supabase
          .from('jobs')
          .update({ status: 'completed', error: null, updated_at: new Date().toISOString() })
          .eq('id', job.id)

        processed++
      } catch (err) {
        errors++
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error(`[worker] job ${job.id} (${job.type}) falhou:`, errorMsg)

        if (job.attempts >= 3) {
          await supabase
            .from('jobs')
            .update({ status: 'failed', error: errorMsg, updated_at: new Date().toISOString() })
            .eq('id', job.id)
        } else {
          // Backoff exponencial: 60s × 2^(attempt-1)
          const backoffMs = 60_000 * Math.pow(2, job.attempts - 1)
          const retryAfter = new Date(Date.now() + backoffMs).toISOString()
          await supabase
            .from('jobs')
            .update({ status: 'pending', error: errorMsg, retry_after: retryAfter })
            .eq('id', job.id)
        }
      }
    })
  )

  return { processed, errors, skipped }
}

export async function enqueueJob(
  type: Job['type'],
  payload: Record<string, unknown>,
  opts: { examId?: string; questionId?: string } = {}
): Promise<string> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      type,
      payload,
      exam_id: opts.examId ?? null,
      question_id: opts.questionId ?? null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) throw new Error(`Falha ao enfileirar job: ${error.message}`)
  return data.id
}
