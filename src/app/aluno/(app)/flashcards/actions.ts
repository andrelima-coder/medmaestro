'use server'

import { createClient } from '@/lib/supabase/server'
import type { FlashcardEstado } from '@/lib/aluno/flashcards'

// Flashcards SRS v2 (estilo Anki) — RPCs da migration 044.
// SECURITY DEFINER com auth.uid(); acesso restrito ao papel authenticated.

export type Grau = 1 | 2 | 3 | 4

export type RegistrarData = {
  pontosGanhos: number
  proximaRevisao: string | null
  voltaEmMinutos: number | null
  estado: FlashcardEstado
  leech: boolean
  snapshot: unknown
}

type RegistrarResult = { ok: true; data: RegistrarData } | { ok: false; error: string }

export async function flashcardRegistrarAction(flashcardId: string, grau: Grau): Promise<RegistrarResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado.' }

  const { data, error } = await supabase.rpc('mt_flashcard_registrar_v2', {
    p_flashcard_id: flashcardId,
    p_grau: grau,
  })
  if (error) return { ok: false, error: 'Falha ao registrar: ' + error.message }

  const d = data as {
    pontos_ganhos: number
    proxima_revisao: string | null
    volta_em_minutos: number | null
    estado: FlashcardEstado
    leech: boolean
    snapshot: unknown
  }
  return {
    ok: true,
    data: {
      pontosGanhos: d.pontos_ganhos,
      proximaRevisao: d.proxima_revisao,
      voltaEmMinutos: d.volta_em_minutos,
      estado: d.estado,
      leech: d.leech,
      snapshot: d.snapshot,
    },
  }
}

type DesfazerResult = { ok: true } | { ok: false; error: string }

export async function flashcardDesfazerAction(flashcardId: string, snapshot: unknown): Promise<DesfazerResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado.' }

  const { error } = await supabase.rpc('mt_flashcard_desfazer', {
    p_flashcard_id: flashcardId,
    p_snapshot: snapshot,
  })
  if (error) return { ok: false, error: 'Falha ao desfazer: ' + error.message }
  return { ok: true }
}
