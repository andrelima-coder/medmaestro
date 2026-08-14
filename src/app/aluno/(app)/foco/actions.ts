'use server'

import { createClient } from '@/lib/supabase/server'

// Sessão de foco (timer). Reaproveita mt_registrar_sessao() já existente —
// sem tabela/schema novo (portado do mentortemi-web).

export async function registrarSessaoAction(
  moduloSlug: string | null,
  minutos: number
): Promise<{ ok: boolean; pontos?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado.' }

  const min = Math.max(1, Math.round(minutos))
  const { error } = await supabase.rpc('mt_registrar_sessao', {
    p_tipo: 'pomodoro',
    p_modulo_slug: moduloSlug,
    p_minutos: min,
  })
  if (error) return { ok: false, error: 'Falha ao registrar: ' + error.message }

  return { ok: true, pontos: Math.min(60, min) }
}
