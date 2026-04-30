'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sanitizeRichTextHtml, htmlToPlainText } from '@/lib/utils/sanitize-html'

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const
type Letter = (typeof LETTERS)[number]

interface SavePayload {
  stem_html: string
  alternatives_html: Partial<Record<Letter, string>>
}

export async function saveQuestionContent(
  questionId: string,
  payload: SavePayload
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const service = createServiceClient()

  const { data: assignment } = await service
    .from('review_assignments')
    .select('assigned_to, expires_at, status')
    .eq('question_id', questionId)
    .single()

  const now = new Date()
  if (
    assignment &&
    assignment.assigned_to !== user.id &&
    assignment.status === 'in_progress' &&
    new Date(assignment.expires_at) > now
  ) {
    return { ok: false, error: 'Questão travada por outro revisor' }
  }

  const stemHtml = sanitizeRichTextHtml(payload.stem_html)
  const stemPlain = htmlToPlainText(stemHtml)

  const altsHtml: Record<string, string> = {}
  const altsPlain: Record<string, string> = {}
  for (const letter of LETTERS) {
    const raw = payload.alternatives_html?.[letter] ?? ''
    const sanitized = sanitizeRichTextHtml(raw)
    altsHtml[letter] = sanitized
    altsPlain[letter] = htmlToPlainText(sanitized)
  }

  const { error } = await service
    .from('questions')
    .update({
      stem: stemPlain,
      stem_html: stemHtml,
      alternatives: altsPlain,
      alternatives_html: altsHtml,
      updated_at: now.toISOString(),
    })
    .eq('id', questionId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/revisao/${questionId}`)
  revalidatePath(`/questoes/${questionId}`)
  return { ok: true }
}
