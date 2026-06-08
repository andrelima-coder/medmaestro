'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Ações de estudo do aluno (feature 003): meta diária e dominar card de erro.

export async function setGoalAction(daily: number): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado.' }
  if (!Number.isFinite(daily) || daily < 1 || daily > 500) {
    return { ok: false, error: 'Meta inválida.' }
  }
  const service = createServiceClient()
  const { error } = await service
    .from('student_goals')
    .upsert({ user_id: user.id, daily_goal: Math.round(daily), updated_at: new Date().toISOString() })
  if (error) return { ok: false, error: 'Falha ao salvar a meta.' }
  revalidatePath('/aluno')
  return { ok: true }
}

export async function dismissCardAction(questionId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado.' }
  const service = createServiceClient()
  const { error } = await service
    .from('student_dismissed_cards')
    .upsert({ user_id: user.id, question_id: questionId })
  if (error) return { ok: false, error: 'Falha ao marcar como dominado.' }
  revalidatePath('/aluno/revisao')
  return { ok: true }
}
