'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

const ROLES = ['analista', 'professor', 'admin', 'superadmin'] as const
type Role = typeof ROLES[number]

const ROLE_RANK: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if ((ROLE_RANK[profile?.role ?? ''] ?? -1) < ROLE_RANK['admin']) return null
  return { user, role: profile?.role as Role }
}

export async function changeUserRole(
  targetUserId: string,
  newRole: Role
): Promise<{ ok: boolean; error?: string }> {
  const caller = await assertAdmin()
  if (!caller) return { ok: false, error: 'Sem permissão' }

  if (!ROLES.includes(newRole)) return { ok: false, error: 'Role inválido' }

  // Apenas superadmin pode promover a superadmin ou rebaixar superadmin
  const service = createServiceClient()
  const { data: target } = await service
    .from('profiles')
    .select('role, email')
    .eq('id', targetUserId)
    .single()

  if (!target) return { ok: false, error: 'Usuário não encontrado' }

  const callerRank = ROLE_RANK[caller.role] ?? -1
  const targetCurrentRank = ROLE_RANK[target.role ?? ''] ?? -1
  const newRoleRank = ROLE_RANK[newRole] ?? -1

  if (callerRank < ROLE_RANK['superadmin']) {
    if (newRoleRank >= ROLE_RANK['superadmin']) {
      return { ok: false, error: 'Apenas superadmin pode atribuir esse nível' }
    }
    if (targetCurrentRank >= ROLE_RANK['superadmin']) {
      return { ok: false, error: 'Apenas superadmin pode alterar outro superadmin' }
    }
  }

  const { error } = await service
    .from('profiles')
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq('id', targetUserId)

  if (error) return { ok: false, error: error.message }

  await logAudit(caller.user.id, 'profiles', targetUserId, 'user_role_changed',
    { role: target.role },
    { role: newRole }
  )

  revalidatePath('/configuracoes/usuarios')
  return { ok: true }
}
