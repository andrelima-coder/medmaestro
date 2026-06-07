import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Guards de autenticação/autorização para Server Actions.
 *
 * Motivação (auditoria pré-lançamento): o app usa `service_role` (que ignora
 * RLS) em quase todas as actions, e NÃO há middleware. Logo, toda action
 * precisa verificar a identidade/papel do chamador manualmente — caso
 * contrário fica exposta como endpoint POST não autenticado. Estes helpers
 * centralizam essa checagem para que o padrão não se perca entre arquivos.
 */

export type AppRole = 'analista' | 'professor' | 'admin' | 'superadmin'

export const ROLE_RANK: Record<string, number> = {
  analista: 0,
  professor: 1,
  admin: 2,
  superadmin: 3,
}

export type AuthedUser = { id: string; role: AppRole }

/** Retorna o usuário autenticado + papel (lido do banco), ou null se não logado. */
export async function getAuthedUser(): Promise<AuthedUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return { id: user.id, role: (profile?.role ?? 'analista') as AppRole }
}

export type GuardResult =
  | { ok: true; user: AuthedUser }
  | { ok: false; error: string }

/** Exige apenas que o chamador esteja autenticado. */
export async function requireUser(): Promise<GuardResult> {
  const user = await getAuthedUser()
  if (!user) return { ok: false, error: 'Não autenticado' }
  return { ok: true, user }
}

/** Exige papel mínimo (hierárquico). Ex.: requireRole('admin'). */
export async function requireRole(min: AppRole): Promise<GuardResult> {
  const user = await getAuthedUser()
  if (!user) return { ok: false, error: 'Não autenticado' }
  if ((ROLE_RANK[user.role] ?? -1) < ROLE_RANK[min]) {
    return { ok: false, error: 'Sem permissão' }
  }
  return { ok: true, user }
}

/** Atalho: exige revisor (professor ou acima). */
export async function requireReviewer(): Promise<GuardResult> {
  return requireRole('professor')
}
