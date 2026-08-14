import type { SupabaseClient } from '@supabase/supabase-js'

export type FlashcardFilaItem = {
  flashcardId: string
  front: string
  back: string
  cardType: string | null
  novo: boolean
}

/** Fila de flashcards SRS (mt_flashcard_fila) — porte do mentortemi-web. */
export async function getFlashcardFila(supabase: SupabaseClient, limite = 20): Promise<FlashcardFilaItem[]> {
  const { data, error } = await supabase.rpc('mt_flashcard_fila', { p_limite: limite })
  if (error || !data) return []
  const rows = data as {
    flashcard_id: string
    front: string
    back: string
    card_type: string | null
    novo: boolean
  }[]
  return rows.map((r) => ({
    flashcardId: r.flashcard_id,
    front: r.front,
    back: r.back,
    cardType: r.card_type,
    novo: r.novo,
  }))
}
