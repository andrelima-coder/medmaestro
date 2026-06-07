'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/lib/utils/rate-limit'

export type CadastroState = { error: string } | null

// Anti-abuso: 5 cadastros / 10 min por IP+email.
const checkSignupLimit = rateLimit('aluno-signup', { max: 5, windowMs: 10 * 60_000 })

async function getClientIp(): Promise<string> {
  const h = await headers()
  const xff = h.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return h.get('x-real-ip')?.trim() ?? 'unknown'
}

/**
 * Cadastro de aluno (feature 001 — T012).
 * Unicidade por e-mail (RN-02). Papel forçado para `aluno` via service-role,
 * independentemente do default do trigger handle_new_user.
 */
export async function cadastroAlunoAction(
  _prev: CadastroState,
  formData: FormData
): Promise<CadastroState> {
  const fullName = (formData.get('full_name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const phone = (formData.get('phone') as string)?.trim()
  const password = formData.get('password') as string
  const origin = ((formData.get('origin') as string) ?? '').trim() || null

  if (!fullName || !email || !phone || !password) {
    return { error: 'Preencha nome, e-mail, WhatsApp e senha.' }
  }
  if (password.length < 8) {
    return { error: 'A senha deve ter ao menos 8 caracteres.' }
  }

  const ip = await getClientIp()
  const limit = checkSignupLimit(`${ip}:${email}`)
  if (!limit.ok) {
    return { error: `Muitas tentativas. Tente novamente em ${limit.retryAfterSec}s.` }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    // Mensagem genérica para não enumerar contas existentes.
    if (error.message.toLowerCase().includes('already')) {
      return { error: 'Não foi possível concluir o cadastro. Tente fazer login.' }
    }
    return { error: error.message }
  }

  // Garante papel `aluno` e grava dados de lead (service-role ignora RLS).
  const userId = data.user?.id
  if (userId) {
    const admin = createServiceClient()
    await admin
      .from('profiles')
      .update({ role: 'aluno', full_name: fullName, phone, origin })
      .eq('id', userId)
  }

  redirect('/aluno')
}
