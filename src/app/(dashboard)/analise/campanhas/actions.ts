'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

// Analytics agregado por campanha (feature 002 — A007/A008).

async function assertAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  const rank: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }
  if ((rank[profile?.role ?? ''] ?? -1) < rank['admin']) return null
  return user
}

export async function recalcAnalyticsAction(): Promise<{ ok: boolean; error?: string }> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão.' }
  const service = createServiceClient()
  const { error } = await service.rpc('recalc_analytics')
  if (error) return { ok: false, error: error.message }
  await logAudit(user.id, 'analytics', user.id, 'analytics_recalculated', null, null)
  revalidatePath('/analise/campanhas')
  return { ok: true }
}
