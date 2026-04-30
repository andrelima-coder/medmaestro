import { createServiceClient } from '@/lib/supabase/service'

const TTL = {
  images: 3_600,     // 1 hora — D13
  exports: 86_400,   // 24 horas — D13
} as const

type Bucket =
  | 'question-images'
  | 'comment-images'
  | 'exam-pdfs'
  | 'exports'
  | 'question-attachments'

async function createSignedUrl(bucket: Bucket, path: string, expiresIn: number): Promise<string> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)

  if (error || !data?.signedUrl) {
    throw new Error(`Falha ao gerar signed URL para ${bucket}/${path}: ${error?.message}`)
  }

  return data.signedUrl
}

export function getQuestionImageUrl(path: string) {
  return createSignedUrl('question-images', path, TTL.images)
}

export function getCommentImageUrl(path: string) {
  return createSignedUrl('comment-images', path, TTL.images)
}

export function getExamPdfUrl(path: string) {
  return createSignedUrl('exam-pdfs', path, TTL.images)
}

export function getExportUrl(path: string) {
  return createSignedUrl('exports', path, TTL.exports)
}

export function getQuestionAttachmentUrl(path: string) {
  return createSignedUrl('question-attachments', path, TTL.images)
}

/**
 * Gera signed URLs para múltiplos caminhos de uma vez.
 * Útil para exibir um conjunto de imagens de questão.
 */
export async function getQuestionImageUrls(paths: string[]): Promise<Record<string, string>> {
  const supabase = createServiceClient()

  const { data, error } = await supabase.storage
    .from('question-images')
    .createSignedUrls(paths, TTL.images)

  if (error) throw new Error(`Falha ao gerar signed URLs: ${error.message}`)

  return Object.fromEntries(
    (data ?? []).map((item) => [item.path, item.signedUrl ?? ''])
  )
}

/**
 * Faz upload de um arquivo para o bucket e retorna o path.
 */
export async function uploadFile(
  bucket: Bucket,
  path: string,
  data: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const supabase = createServiceClient()

  const { error } = await supabase.storage.from(bucket).upload(path, data, {
    contentType,
    upsert: true,
  })

  if (error) throw new Error(`Falha no upload para ${bucket}/${path}: ${error.message}`)
  return path
}
