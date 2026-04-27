'use server'

import { createClient } from '@/lib/supabase/server'

export type ForgotState = { success?: boolean; error?: string } | null

export async function forgotPasswordAction(
  _prev: ForgotState,
  formData: FormData
): Promise<ForgotState> {
  const email = (formData.get('email') as string)?.trim()
  if (!email) return { error: 'Informe seu e-mail.' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const supabase = await createClient()

  // Envia o e-mail de recuperação via Supabase Auth.
  // Sempre retorna sucesso para não vazar se o endereço existe na base.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/api/auth/callback?next=/reset-password`,
  })

  if (error) {
    console.error('[reset-password]', error.message)
  }

  return { success: true }
}
