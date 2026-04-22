'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function saveQuestionTags(
  questionId: string,
  newTagIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const service = createServiceClient()

  // Snapshot do estado atual antes da edição
  const { data: currentTags } = await service
    .from('question_tags')
    .select('tag_id')
    .eq('question_id', questionId)

  const currentTagIds = (currentTags ?? []).map((t) => t.tag_id as string)

  // Só salva se houve mudança real
  const changed =
    currentTagIds.length !== newTagIds.length ||
    newTagIds.some((id) => !currentTagIds.includes(id))

  if (!changed) return { ok: true }

  // Próximo número de revisão
  const { data: lastRev } = await service
    .from('question_revisions')
    .select('revision_number')
    .eq('question_id', questionId)
    .order('revision_number', { ascending: false })
    .limit(1)
    .single()

  const nextRevision = (lastRev?.revision_number ?? 0) + 1

  // Grava revisão com snapshot das tags antes
  const { error: revErr } = await service.from('question_revisions').insert({
    question_id: questionId,
    revision_number: nextRevision,
    created_by: user.id,
    snapshot: { tag_ids: currentTagIds, change_type: 'tag_update' },
    change_reason: 'tag_update',
  })

  if (revErr) return { ok: false, error: revErr.message }

  // Delete todas as tags atuais e insere as novas
  await service.from('question_tags').delete().eq('question_id', questionId)

  if (newTagIds.length > 0) {
    const { error: insErr } = await service.from('question_tags').insert(
      newTagIds.map((tagId) => ({
        question_id: questionId,
        tag_id: tagId,
        added_by_type: 'human',
        added_by: user.id,
      }))
    )
    if (insErr) return { ok: false, error: insErr.message }
  }

  return { ok: true }
}

export async function undoLastTagEdit(
  questionId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const service = createServiceClient()

  // Última revisão de tags
  const { data: revision } = await service
    .from('question_revisions')
    .select('id, snapshot')
    .eq('question_id', questionId)
    .eq('change_reason', 'tag_update')
    .order('revision_number', { ascending: false })
    .limit(1)
    .single()

  if (!revision) return { ok: false, error: 'Nenhuma revisão para desfazer' }

  const snapshot = revision.snapshot as { tag_ids?: string[] }
  const restoredTagIds = snapshot.tag_ids ?? []

  // Restaura as tags
  await service.from('question_tags').delete().eq('question_id', questionId)

  if (restoredTagIds.length > 0) {
    await service.from('question_tags').insert(
      restoredTagIds.map((tagId) => ({
        question_id: questionId,
        tag_id: tagId,
        added_by_type: 'human',
        added_by: user.id,
      }))
    )
  }

  // Remove a revisão desfeita
  await service.from('question_revisions').delete().eq('id', revision.id)

  revalidatePath(`/questoes/${questionId}`)
  return { ok: true }
}
