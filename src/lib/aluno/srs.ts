import type { SupabaseClient } from '@supabase/supabase-js'

export type SrsFilaItem = {
  conceitoId: string
  proposicao: string
  modulo: string
  questionId: string
}

/** Fila de revisão SRS por conceito (srs_fila) — porte do mentortemi-web. */
export async function getSrsFila(supabase: SupabaseClient, limite = 20): Promise<SrsFilaItem[]> {
  const { data, error } = await supabase.rpc('srs_fila', { p_limite: limite })
  if (error || !data) return []
  const rows = data as {
    conceito_id: string
    proposicao: string
    modulo: string
    question_id: string | null
  }[]
  return rows
    .filter((r) => r.question_id != null)
    .map((r) => ({
      conceitoId: r.conceito_id,
      proposicao: r.proposicao,
      modulo: r.modulo,
      questionId: r.question_id as string,
    }))
}
