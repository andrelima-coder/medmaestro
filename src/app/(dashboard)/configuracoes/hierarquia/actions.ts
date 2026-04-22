'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

const REVALIDATE = '/configuracoes/hierarquia'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  const rank: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }
  if ((rank[profile?.role ?? ''] ?? -1) < rank['admin']) return null
  return user
}

// ── Bancas ──────────────────────────────────────────────────────────────────

export async function createBoard(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão' }

  const name = (formData.get('name') as string)?.trim()
  const short_name = (formData.get('short_name') as string)?.trim()
  const slug = (formData.get('slug') as string)?.trim()
  if (!name || !short_name || !slug) return { ok: false, error: 'Todos os campos são obrigatórios' }

  const service = createServiceClient()
  const { data, error } = await service
    .from('exam_boards')
    .insert({ name, short_name, slug })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Falha ao criar' }

  await logAudit(user.id, 'exam_boards', data.id, 'INSERT', null, { name, short_name, slug })
  revalidatePath(REVALIDATE)
  return { ok: true }
}

export async function updateBoard(
  id: string,
  fields: { name?: string; short_name?: string; slug?: string }
): Promise<{ ok: boolean; error?: string }> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão' }

  const service = createServiceClient()
  const { data: before } = await service
    .from('exam_boards')
    .select('name, short_name, slug')
    .eq('id', id)
    .single()

  const { error } = await service.from('exam_boards').update(fields).eq('id', id)
  if (error) return { ok: false, error: error.message }

  await logAudit(user.id, 'exam_boards', id, 'UPDATE', before ?? null, fields)
  revalidatePath(REVALIDATE)
  return { ok: true }
}

export async function deleteBoard(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão' }

  const service = createServiceClient()
  const { data: before } = await service
    .from('exam_boards')
    .select('name, short_name')
    .eq('id', id)
    .single()

  const { error } = await service.from('exam_boards').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  await logAudit(user.id, 'exam_boards', id, 'DELETE', before ?? null, null)
  revalidatePath(REVALIDATE)
  return { ok: true }
}

// ── Especialidades ───────────────────────────────────────────────────────────

export async function createSpecialty(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão' }

  const name = (formData.get('name') as string)?.trim()
  const slug = (formData.get('slug') as string)?.trim()
  if (!name || !slug) return { ok: false, error: 'Nome e slug são obrigatórios' }

  const service = createServiceClient()
  const { data, error } = await service
    .from('specialties')
    .insert({ name, slug })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Falha ao criar' }

  await logAudit(user.id, 'specialties', data.id, 'INSERT', null, { name, slug })
  revalidatePath(REVALIDATE)
  return { ok: true }
}

export async function updateSpecialty(
  id: string,
  fields: { name?: string; slug?: string }
): Promise<{ ok: boolean; error?: string }> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão' }

  const service = createServiceClient()
  const { data: before } = await service
    .from('specialties')
    .select('name, slug')
    .eq('id', id)
    .single()

  const { error } = await service.from('specialties').update(fields).eq('id', id)
  if (error) return { ok: false, error: error.message }

  await logAudit(user.id, 'specialties', id, 'UPDATE', before ?? null, fields)
  revalidatePath(REVALIDATE)
  return { ok: true }
}

export async function deleteSpecialty(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão' }

  const service = createServiceClient()
  const { data: before } = await service
    .from('specialties')
    .select('name, slug')
    .eq('id', id)
    .single()

  const { error } = await service.from('specialties').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  await logAudit(user.id, 'specialties', id, 'DELETE', before ?? null, null)
  revalidatePath(REVALIDATE)
  return { ok: true }
}
