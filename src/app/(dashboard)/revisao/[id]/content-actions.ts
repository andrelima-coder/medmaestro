'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sanitizeRichTextHtml, htmlToPlainText } from '@/lib/utils/sanitize-html'

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const
type Letter = (typeof LETTERS)[number]

const REVIEWER_ROLES = new Set(['professor', 'admin', 'superadmin'])

interface SavePayload {
  stem_html: string
  alternatives_html: Partial<Record<Letter, string>>
}

async function requireReviewer(
  service: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profile } = await service
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  if (!profile || !REVIEWER_ROLES.has(profile.role as string)) {
    return { ok: false, error: 'Apenas revisores podem editar questões' }
  }
  return { ok: true }
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

  const authz = await requireReviewer(service, user.id)
  if (!authz.ok) return authz

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

  const { data: previous, error: prevErr } = await service
    .from('questions')
    .select('*')
    .eq('id', questionId)
    .single()

  if (prevErr || !previous) return { ok: false, error: 'Questão não encontrada' }

  const stemUnchanged =
    previous.stem === stemPlain && previous.stem_html === stemHtml
  const altsUnchanged =
    JSON.stringify(previous.alternatives ?? {}) === JSON.stringify(altsPlain) &&
    JSON.stringify(previous.alternatives_html ?? {}) === JSON.stringify(altsHtml)

  if (stemUnchanged && altsUnchanged) {
    return { ok: true }
  }

  const { data: lastRev } = await service
    .from('question_revisions')
    .select('revision_number')
    .eq('question_id', questionId)
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextRevision = ((lastRev?.revision_number as number | null) ?? 0) + 1

  await service.from('question_revisions').insert({
    question_id: questionId,
    revision_number: nextRevision,
    created_by: user.id,
    snapshot: previous,
    change_reason: 'content_edit',
  })

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

  await service.from('audit_logs').insert({
    user_id: user.id,
    entity_type: 'question',
    entity_id: questionId,
    action: 'content_edit',
    before_data: {
      stem: previous.stem,
      stem_html: previous.stem_html,
      alternatives: previous.alternatives,
      alternatives_html: previous.alternatives_html,
    },
    after_data: {
      stem: stemPlain,
      stem_html: stemHtml,
      alternatives: altsPlain,
      alternatives_html: altsHtml,
    },
  })

  revalidatePath(`/revisao/${questionId}`)
  revalidatePath(`/questoes/${questionId}`)
  return { ok: true }
}

export async function undoLastEdit(
  questionId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const service = createServiceClient()

  const authz = await requireReviewer(service, user.id)
  if (!authz.ok) return authz

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

  const { data: lastRev, error: revErr } = await service
    .from('question_revisions')
    .select('id, revision_number, snapshot, change_reason')
    .eq('question_id', questionId)
    .in('change_reason', ['content_edit', 'tag_update'])
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (revErr || !lastRev) return { ok: false, error: 'Nenhuma edição para desfazer' }

  const snap = lastRev.snapshot as Record<string, unknown>

  const { error: updateErr } = await service
    .from('questions')
    .update({
      stem: snap.stem ?? null,
      stem_html: snap.stem_html ?? null,
      alternatives: snap.alternatives ?? {},
      alternatives_html: snap.alternatives_html ?? {},
      updated_at: now.toISOString(),
    })
    .eq('id', questionId)

  if (updateErr) return { ok: false, error: updateErr.message }

  await service.from('question_revisions').delete().eq('id', lastRev.id)

  await service.from('audit_logs').insert({
    user_id: user.id,
    entity_type: 'question',
    entity_id: questionId,
    action: 'undo',
    before_data: { revision_number: lastRev.revision_number },
    after_data: null,
  })

  revalidatePath(`/revisao/${questionId}`)
  revalidatePath(`/questoes/${questionId}`)
  return { ok: true }
}
