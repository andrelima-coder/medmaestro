import type { SupabaseClient } from '@supabase/supabase-js'

export type FlashcardEstado = 'novo' | 'aprendendo' | 'revisao' | 'leech'

export type FlashcardFilaItem = {
  flashcardId: string
  front: string
  back: string
  cardType: string | null
  novo: boolean
  estado: FlashcardEstado
  intervaloDias: number
  ease: number
}

/**
 * Fila de flashcards SRS v2 (mt_flashcard_fila_v2): aprendendo/revisão vencidos
 * primeiro, novos por último respeitando o limite diário. intervalo/ease vêm
 * junto para o front exibir a previsão de cada botão de resposta.
 */
export async function getFlashcardFila(
  supabase: SupabaseClient,
  limite = 30,
  novosMax = 20
): Promise<FlashcardFilaItem[]> {
  const { data, error } = await supabase.rpc('mt_flashcard_fila_v2', {
    p_limite: limite,
    p_novos_max: novosMax,
  })
  if (error || !data) return []
  const rows = data as {
    flashcard_id: string
    front: string
    back: string
    card_type: string | null
    estado: FlashcardEstado
    novo: boolean
    intervalo_dias: number
    ease: number
  }[]
  return rows.map((r) => ({
    flashcardId: r.flashcard_id,
    front: r.front,
    back: r.back,
    cardType: r.card_type,
    novo: r.novo,
    estado: r.estado,
    intervaloDias: Number(r.intervalo_dias),
    ease: Number(r.ease),
  }))
}
