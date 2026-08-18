'use server'

import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/utils/rate-limit'

export type LoginState = { error: string } | null

// 5 tentativas em 5 min por IP+email — mesmo padrão do login da staff.
const checkLoginLimit = rateLimit('aluno-login', { max: 5, windowMs: 5 * 60_000 })

async function getClientIp(): Promise<string> {
  const h = await headers()
  const xff = h.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return h.get('x-real-ip')?.trim() ?? 'unknown'
}

/**
 * Login do aluno (feature 001 — T012). Superfície separada da staff:
 * só prossegue para /aluno se o papel for `aluno`; caso contrário, encerra a
 * sessão e orienta o uso do login interno.
 */
export async function loginAlunoAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string

  if (!email || !password) return { error: 'Preencha e-mail e senha.' }

  const ip = await getClientIp()
  const limit = checkLoginLimit(`${ip}:${email}`)
  if (!limit.ok) {
    return { error: `Muitas tentativas. Tente novamente em ${limit.retryAfterSec}s.` }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'E-mail ou senha incorretos.' }
  }

  // Garante que esta superfície é só para alunos.
  const userId = data.user?.id
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId!)
    .single()

  if (profile?.role && profile.role !== 'aluno') {
    await supabase.auth.signOut()
    return { error: 'Esta área é exclusiva para alunos. Use o acesso interno.' }
  }

  // Caches de papel/acesso do usuário anterior não valem para esta sessão.
  const jar = await cookies()
  jar.delete('mm-role')
  jar.delete('mm-acesso')

  redirect('/aluno')
}
