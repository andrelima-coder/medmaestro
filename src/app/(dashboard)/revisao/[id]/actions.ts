'use server'

import { redirect } from 'next/navigation'
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

  const { data: existing } = await service
    .from('review_assignments')
    .select('assigned_to, expires_at, status')
    .eq('question_id', questionId)
    .single()

  if (
    existing &&
    existing.assigned_to !== user.id &&
    existing.status === 'in_progress' &&
    new Date(existing.expires_at) > now
  ) {
    return { ok: false }
  }

  const expiresAt = new Date(now.getTime() + TEN_MINUTES_MS).toISOString()

  const { error } = await service.from('review_assignments').upsert(
    {
      question_id: questionId,
      assigned_to: user.id,
      status: 'in_progress',
      assigned_at: now.toISOString(),
      expires_at: expiresAt,
    },
    { onConflict: 'question_id' }
  )

  if (error) return { ok: false }
  return { ok: true, expiresAt }
}

type ReviewAction = 'approve' | 'reject' | 'flag'

const ACTION_STATUS: Record<ReviewAction, string> = {
  approve: 'approved',
  reject: 'rejected',
  flag: 'pending_extraction',
}

export async function submitReviewAction(
  questionId: string,
  action: ReviewAction,
  note?: string
): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const service = createServiceClient()

  const { data: question, error: qErr } = await service
    .from('questions')
    .select('*')
    .eq('id', questionId)
    .single()

  if (qErr || !question) throw new Error('Questão não encontrada')

  const newStatus = ACTION_STATUS[action]

  const { data: lastRev } = await service
    .from('question_revisions')
    .select('revision_number')
    .eq('question_id', questionId)
    .order('revision_number', { ascending: false })
    .limit(1)
    .single()

  const nextRevision = (lastRev?.revision_number ?? 0) + 1

  await service.from('question_revisions').insert({
    question_id: questionId,
    revision_number: nextRevision,
    created_by: user.id,
    snapshot: question,
    change_reason: note ? `${action}: ${note}` : action,
  })

  await service
    .from('questions')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', questionId)

  await service
    .from('review_assignments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('question_id', questionId)
    .eq('assigned_to', user.id)

  await service.from('audit_logs').insert({
    user_id: user.id,
    entity_type: 'question',
    entity_id: questionId,
    action,
    before_data: { status: question.status },
    after_data: { status: newStatus, note: note ?? null },
  })

  redirect('/revisao')
}

export async function saveAsDraft(questionId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const service = createServiceClient()

  await service
    .from('questions')
    .update({ status: 'pending_review', updated_at: new Date().toISOString() })
    .eq('id', questionId)

  await service
    .from('review_assignments')
    .update({ status: 'released', completed_at: new Date().toISOString() })
    .eq('question_id', questionId)
    .eq('assigned_to', user.id)

  await service.from('audit_logs').insert({
    user_id: user.id,
    entity_type: 'question',
    entity_id: questionId,
    action: 'save_draft',
    after_data: { status: 'pending_review' },
  })

  redirect('/revisao')
}
