'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

// Calibração de dificuldade (feature 001 — T024/T025).

const MIN_RESPONSES = 30

export async function recalcCalibrationAction(): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole('admin')
  if (!guard.ok) return { ok: false, error: guard.error }
  const user = guard.user

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
  const guard = await requireRole('admin')
  if (!guard.ok) return { ok: false, error: guard.error }
  const service = createServiceClient()
  const { error } = await service
    .from('gabarito_flags')
    .update({ status: 'revisado' })
    .eq('id', flagId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/calibracao')
  return { ok: true }
}
