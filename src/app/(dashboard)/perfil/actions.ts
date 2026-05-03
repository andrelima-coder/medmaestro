'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

export type UpdateProfileResult = { ok: boolean; error?: string }

export async function updateProfileAction(
  fullName: string
): Promise<UpdateProfileResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const trimmed = fullName.trim()
  if (trimmed.length < 2) return { ok: false, error: 'Nome muito curto' }
  if (trimmed.length > 200) return { ok: false, error: 'Nome muito longo' }

  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({ full_name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return { ok: false, error: error.message }

  await logAudit(user.id, 'user', user.id, 'profile_updated', null, {
    full_name: trimmed,
  })

  revalidatePath('/perfil')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string
): Promise<UpdateProfileResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) redirect('/login')

  if (newPassword.length < 8)
    return { ok: false, error: 'Nova senha precisa ter ao menos 8 caracteres' }
  if (newPassword === currentPassword)
    return { ok: false, error: 'Nova senha deve ser diferente da atual' }

  // Reautentica com a senha atual antes de trocar
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (signInErr) return { ok: false, error: 'Senha atual incorreta' }

  const { error: updErr } = await supabase.auth.updateUser({
    password: newPassword,
  })
  if (updErr) return { ok: false, error: updErr.message }

  await logAudit(user.id, 'user', user.id, 'password_changed', null, null)

  return { ok: true }
}
