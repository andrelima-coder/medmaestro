'use server'

import { createClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/storage/signed-urls'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function uploadInlineImage(
  questionId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string; url?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'Arquivo inválido' }
  if (file.size <= 0) return { ok: false, error: 'Arquivo vazio' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'Imagem maior que 10 MB' }
  if (!ALLOWED_MIME.has(file.type))
    return { ok: false, error: `Tipo não suportado: ${file.type || '?'}` }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
  const path = `inline/${questionId}/${Date.now()}_${safeName}`

  const buffer = Buffer.from(await file.arrayBuffer())
  try {
    await uploadFile('question-attachments', path, buffer, file.type)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Falha no upload',
    }
  }

  // URL estável servida via rota proxy (ela renova a signed URL a cada requisição).
  return { ok: true, url: `/api/qa-image/${path}` }
}
