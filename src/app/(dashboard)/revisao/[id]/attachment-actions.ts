'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getQuestionAttachmentUrl, uploadFile } from '@/lib/storage/signed-urls'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
])

export interface QuestionAttachment {
  id: string
  question_id: string
  file_name: string
  mime_type: string
  size_bytes: number
  caption: string | null
  storage_path: string
  signed_url: string
  uploaded_by: string | null
  uploaded_by_name: string | null
  created_at: string
}

export async function getQuestionAttachments(
  questionId: string
): Promise<QuestionAttachment[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('question_attachments')
    .select(
      'id, question_id, file_name, mime_type, size_bytes, caption, storage_path, uploaded_by, created_at, profiles:uploaded_by(full_name)'
    )
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  const out: QuestionAttachment[] = []
  for (const row of data) {
    let signed = ''
    try {
      signed = await getQuestionAttachmentUrl(row.storage_path as string)
    } catch {
      // ignora — render mostra placeholder
    }
    const profileRaw = row.profiles as
      | { full_name: string | null }
      | { full_name: string | null }[]
      | null
    const profile = Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw
    out.push({
      id: row.id as string,
      question_id: row.question_id as string,
      file_name: row.file_name as string,
      mime_type: row.mime_type as string,
      size_bytes: row.size_bytes as number,
      caption: (row.caption as string | null) ?? null,
      storage_path: row.storage_path as string,
      signed_url: signed,
      uploaded_by: (row.uploaded_by as string | null) ?? null,
      uploaded_by_name: profile?.full_name ?? null,
      created_at: row.created_at as string,
    })
  }
  return out
}

export async function uploadQuestionAttachment(
  questionId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string; attachment?: QuestionAttachment }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const file = formData.get('file')
  const caption = (formData.get('caption') as string | null)?.trim() || null

  if (!(file instanceof File)) return { ok: false, error: 'Arquivo inválido' }
  if (file.size <= 0) return { ok: false, error: 'Arquivo vazio' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'Arquivo maior que 10 MB' }
  if (!ALLOWED_MIME.has(file.type))
    return { ok: false, error: `Tipo não suportado: ${file.type || '?'}` }

  const service = createServiceClient()

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  const path = `${questionId}/${Date.now()}_${safeName}`

  const buffer = Buffer.from(await file.arrayBuffer())
  try {
    await uploadFile('question-attachments', path, buffer, file.type)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Falha no upload',
    }
  }

  const { data: inserted, error } = await service
    .from('question_attachments')
    .insert({
      question_id: questionId,
      uploaded_by: user.id,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      caption,
    })
    .select(
      'id, question_id, file_name, mime_type, size_bytes, caption, storage_path, uploaded_by, created_at, profiles:uploaded_by(full_name)'
    )
    .single()

  if (error || !inserted) return { ok: false, error: error?.message ?? 'Falha ao salvar registro' }

  let signed = ''
  try {
    signed = await getQuestionAttachmentUrl(path)
  } catch {
    /* ignore */
  }

  const insertedProfileRaw = inserted.profiles as
    | { full_name: string | null }
    | { full_name: string | null }[]
    | null
  const profile = Array.isArray(insertedProfileRaw)
    ? insertedProfileRaw[0] ?? null
    : insertedProfileRaw
  const attachment: QuestionAttachment = {
    id: inserted.id as string,
    question_id: inserted.question_id as string,
    file_name: inserted.file_name as string,
    mime_type: inserted.mime_type as string,
    size_bytes: inserted.size_bytes as number,
    caption: (inserted.caption as string | null) ?? null,
    storage_path: inserted.storage_path as string,
    signed_url: signed,
    uploaded_by: (inserted.uploaded_by as string | null) ?? null,
    uploaded_by_name: profile?.full_name ?? null,
    created_at: inserted.created_at as string,
  }

  revalidatePath(`/revisao/${questionId}`)
  revalidatePath(`/questoes/${questionId}`)
  return { ok: true, attachment }
}

export async function deleteQuestionAttachment(
  attachmentId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const service = createServiceClient()

  const { data: row } = await service
    .from('question_attachments')
    .select('id, question_id, storage_path, uploaded_by')
    .eq('id', attachmentId)
    .single()
  if (!row) return { ok: false, error: 'Anexo não encontrado' }

  const { data: profile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin'
  if (row.uploaded_by !== user.id && !isAdmin) {
    return { ok: false, error: 'Sem permissão para excluir' }
  }

  await service.storage.from('question-attachments').remove([row.storage_path as string])

  const { error: delErr } = await service
    .from('question_attachments')
    .delete()
    .eq('id', attachmentId)
  if (delErr) return { ok: false, error: delErr.message }

  revalidatePath(`/revisao/${row.question_id}`)
  revalidatePath(`/questoes/${row.question_id}`)
  revalidatePath('/admin/anexos')
  return { ok: true }
}
