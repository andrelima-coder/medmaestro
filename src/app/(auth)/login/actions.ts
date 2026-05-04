'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/utils/rate-limit'

export type LoginState = { error: string } | null

// 5 tentativas em 5 min por IP — bloqueia brute force sem irritar usuário comum
const checkLoginLimit = rateLimit('login', { max: 5, windowMs: 5 * 60_000 })

async function getClientIpFromHeaders(): Promise<string> {
  const h = await headers()
  const xff = h.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return h.get('x-real-ip')?.trim() ?? 'unknown'
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Preencha e-mail e senha.' }
  }

  const ip = await getClientIpFromHeaders()
  // Chave compostas (IP + email lower) para mitigar tanto brute force vertical
  // (1 senha → muitos emails) quanto horizontal (1 email → muitas senhas)
  const limit = checkLoginLimit(`${ip}:${email.toLowerCase()}`)
  if (!limit.ok) {
    return {
      error: `Muitas tentativas. Tente novamente em ${limit.retryAfterSec}s.`,
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      return { error: 'E-mail ou senha incorretos.' }
    }
    return { error: error.message }
  }

  redirect('/dashboard')
}
