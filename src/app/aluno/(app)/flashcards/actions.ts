'use server'

import { createClient } from '@/lib/supabase/server'

// Flashcards SRS (feature mentoria — porte do mentortemi-web). Reaproveita
// mt_flashcard_registrar() já existente, chamado pelo cliente autenticado
// (RPC é SECURITY DEFINER e precisa de auth.uid()).

type RegistrarResult =
  | { ok: true; data: { pontosGanhos: number; proximaRevisao: string } }
  | { ok: false; error: string }

export async function flashcardRegistrarAction(
  flashcardId: string,
  acertou: boolean
): Promise<RegistrarResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado.' }

  const { data, error } = await supabase.rpc('mt_flashcard_registrar', {
    p_flashcard_id: flashcardId,
    p_acertou: acertou,
  })
  if (error) return { ok: false, error: 'Falha ao registrar: ' + error.message }

  const d = data as { pontos_ganhos: number; proxima_revisao: string }
  return { ok: true, data: { pontosGanhos: d.pontos_ganhos, proximaRevisao: d.proxima_revisao } }
}
