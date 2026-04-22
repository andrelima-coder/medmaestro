'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export interface QuestionComment {
  id: string
  comment_type: string
  content: string
  ai_model: string | null
  created_by_ai: boolean
  status: string
  created_at: string
}

export async function getQuestionComments(questionId: string): Promise<QuestionComment[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('question_comments')
    .select('id, comment_type, content, ai_model, created_by_ai, status, created_at')
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })
  return (data ?? []) as QuestionComment[]
}

export async function generateAiComment(
  questionId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const workerSecret = process.env.WORKER_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  try {
    const res = await fetch(`${baseUrl}/api/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workerSecret ? { authorization: `Bearer ${workerSecret}` } : {}),
      },
      body: JSON.stringify({ question_id: questionId }),
    })

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return { ok: false, error: json.error ?? `HTTP ${res.status}` }
    }

    await logAudit(user.id, 'question', questionId, 'comment_generated', null, {
      triggered_by: user.id,
    })

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
