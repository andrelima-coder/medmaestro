'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { generateComment, type CommentsModelKey } from '@/lib/extraction/pipeline'
import { requireUser, requireReviewer } from '@/lib/auth/guards'

export interface QuestionComment {
  id: string
  comment_type: string
  content: string
  ai_model: string | null
  created_by_ai: boolean
  status: string
  created_at: string
}

// Modelos de IA que o professor pode escolher ao gerar um comentário, com
// rótulo amigável e nota de custo/qualidade. Fonte única para UI + validação.
export const COMMENT_MODEL_OPTIONS: { key: CommentsModelKey; label: string; hint: string }[] = [
  { key: 'sonnet', label: 'Claude Sonnet', hint: 'Equilíbrio custo/qualidade (padrão)' },
  { key: 'opus', label: 'Claude Opus', hint: 'Máxima qualidade, mais caro' },
  { key: 'haiku', label: 'Claude Haiku', hint: 'Rápido e econômico' },
]
const ALLOWED_MODELS = new Set<CommentsModelKey>(COMMENT_MODEL_OPTIONS.map((o) => o.key))

export async function getQuestionComments(questionId: string): Promise<QuestionComment[]> {
  const auth = await requireUser()
  if (!auth.ok) return []
  const service = createServiceClient()
  const { data } = await service
    .from('question_comments')
    .select('id, comment_type, content, ai_model, created_by_ai, status, created_at')
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })
  return (data ?? []) as QuestionComment[]
}

/**
 * Gera um comentário didático por IA. O professor escolhe o modelo; quando um
 * modelo é informado, força a criação de um NOVO comentário (permite comparar
 * a saída de modelos diferentes na mesma questão). Só revisores (professor+).
 */
export async function generateAiComment(
  questionId: string,
  model?: CommentsModelKey
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireReviewer()
  if (!auth.ok) return { ok: false, error: auth.error }

  if (model && !ALLOWED_MODELS.has(model)) {
    return { ok: false, error: 'Modelo de IA não permitido' }
  }

  try {
    // Com modelo explícito: force=true (gera novo, para comparação).
    await generateComment(questionId, model ? { model, force: true } : {})

    await logAudit(auth.user.id, 'question', questionId, 'comment_generated', null, {
      triggered_by: auth.user.id,
      model: model ?? 'default',
    })

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
