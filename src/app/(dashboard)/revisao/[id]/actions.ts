'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const TEN_MINUTES_MS = 10 * 60 * 1000

export async function renewClaim(
  questionId: string
): Promise<{ ok: boolean; expiresAt?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false }

  const service = createServiceClient()
  const now = new Date()

  // Verifica que este usuário ainda é o revisor ativo
  const { data: existing } = await service
    .from('review_assignments')
    .select('reviewer_id, expires_at')
    .eq('question_id', questionId)
    .single()

  // Outro revisor com assignment válido assumiu
  if (existing && existing.reviewer_id !== user.id && new Date(existing.expires_at) > now) {
    return { ok: false }
  }

  const expiresAt = new Date(now.getTime() + TEN_MINUTES_MS).toISOString()

  const { error } = await service.from('review_assignments').upsert(
    {
      question_id: questionId,
      reviewer_id: user.id,
      assigned_at: now.toISOString(),
      expires_at: expiresAt,
    },
    { onConflict: 'question_id' }
  )

  if (error) return { ok: false }
  return { ok: true, expiresAt }
}
