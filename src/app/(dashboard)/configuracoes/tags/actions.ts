'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

async function assertAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const service = createServiceClient()
  const { data: profile } = await service
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const rank: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }
  if ((rank[profile?.role ?? ''] ?? -1) < rank['admin']) return null
  return user
}

export async function createTag(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão' }

  const label = (formData.get('label') as string)?.trim()
  const dimension = (formData.get('dimension') as string)?.trim()
  const color = (formData.get('color') as string)?.trim() || null

  if (!label || !dimension) return { ok: false, error: 'Label e dimensão são obrigatórios' }

  const service = createServiceClient()

  const { data: last } = await service
    .from('tags')
    .select('display_order')
    .eq('dimension', dimension)
    .order('display_order', { ascending: false })
    .limit(1)
    .single()

  const display_order = (last?.display_order ?? 0) + 1

  const { data: inserted, error } = await service
    .from('tags')
    .insert({ label, dimension, color, display_order, is_active: true })
    .select('id')
    .single()

  if (error || !inserted) return { ok: false, error: error?.message }

  await logAudit(user.id, 'tag', inserted.id, 'tag_created', null, {
    label, dimension, color, display_order,
  })

  revalidatePath('/configuracoes/tags')
  return { ok: true }
}

export async function updateTag(
  id: string,
  fields: { label?: string; color?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão' }

  const service = createServiceClient()

  const { data: before } = await service
    .from('tags')
    .select('label, color')
    .eq('id', id)
    .single()

  const { error } = await service.from('tags').update(fields).eq('id', id)
  if (error) return { ok: false, error: error.message }

  await logAudit(user.id, 'tag', id, 'tag_updated', before ?? null, fields)

  revalidatePath('/configuracoes/tags')
  return { ok: true }
}

export async function toggleTagActive(
  id: string,
  isActive: boolean
): Promise<{ ok: boolean; error?: string }> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão' }

  const service = createServiceClient()
  const { error } = await service.from('tags').update({ is_active: isActive }).eq('id', id)
  if (error) return { ok: false, error: error.message }

  await logAudit(user.id, 'tag', id, 'tag_toggled', null, { is_active: isActive })

  revalidatePath('/configuracoes/tags')
  return { ok: true }
}

export async function reorderTag(
  id: string,
  direction: 'up' | 'down'
): Promise<{ ok: boolean; error?: string }> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão' }

  const service = createServiceClient()

  const { data: tag } = await service
    .from('tags')
    .select('id, dimension, display_order')
    .eq('id', id)
    .single()

  if (!tag) return { ok: false, error: 'Tag não encontrada' }

  const { data: neighbor } = await service
    .from('tags')
    .select('id, display_order')
    .eq('dimension', tag.dimension)
    .order('display_order', { ascending: direction === 'up' })
    .filter('display_order', direction === 'up' ? 'lt' : 'gt', String(tag.display_order))
    .limit(1)
    .single()

  if (!neighbor) return { ok: true }

  await service.from('tags').update({ display_order: neighbor.display_order }).eq('id', tag.id)
  await service.from('tags').update({ display_order: tag.display_order }).eq('id', neighbor.id)

  await logAudit(user.id, 'tag', id, 'tag_reordered', null, {
    direction,
    old_order: tag.display_order,
    new_order: neighbor.display_order,
  })

  revalidatePath('/configuracoes/tags')
  return { ok: true }
}
