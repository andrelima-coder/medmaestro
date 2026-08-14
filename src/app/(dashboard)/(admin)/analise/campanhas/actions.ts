'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

// Analytics agregado por campanha (feature 002 — A007/A008).

export async function recalcAnalyticsAction(): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole('admin')
  if (!guard.ok) return { ok: false, error: guard.error }
  const user = guard.user
  const service = createServiceClient()
  const { error } = await service.rpc('recalc_analytics')
  if (error) return { ok: false, error: error.message }
  await logAudit(user.id, 'analytics', user.id, 'analytics_recalculated', null, null)
  revalidatePath('/analise/campanhas')
  return { ok: true }
}
