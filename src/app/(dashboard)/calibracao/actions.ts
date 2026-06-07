'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

// Calibração de dificuldade (feature 001 — T024/T025).

async function assertAdmin() {
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
  const rank: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }
  if ((rank[profile?.role ?? ''] ?? -1) < rank['admin']) return null
  return user
}

const MIN_RESPONSES = 30

export async function recalcCalibrationAction(): Promise<{ ok: boolean; error?: string }> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão.' }

  const service = createServiceClient()
  const { error } = await service.rpc('recalc_calibration', { min_responses: MIN_RESPONSES })
  if (error) return { ok: false, error: error.message }

  await logAudit(user.id, 'calibration', user.id, 'calibration_recalculated', null, {
    min_responses: MIN_RESPONSES,
  })
  revalidatePath('/calibracao')
  return { ok: true }
}

export async function resolveGabaritoFlag(flagId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão.' }
  const service = createServiceClient()
  const { error } = await service
    .from('gabarito_flags')
    .update({ status: 'revisado' })
    .eq('id', flagId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/calibracao')
  return { ok: true }
}
