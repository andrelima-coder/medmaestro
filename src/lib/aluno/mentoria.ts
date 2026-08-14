import type { SupabaseClient } from '@supabase/supabase-js'

export type MinhaBanca = {
  bancaId: string
  slug: string
  nome: string
  nomeCurto: string
  diasParaProva: number | null
}

/**
 * Vertente 2 (mentoria — Agenda/Foco/Flashcards/árvore) exige matrícula
 * ativa numa banca. Vertente 3 (funil de captação — Início/Praticar/
 * Simulados) não exige. Chame isso nas páginas de mentoria para decidir
 * entre conteúdo real e o estado "sem matrícula".
 */
export async function getMinhaBancaAtiva(supabase: SupabaseClient): Promise<MinhaBanca | null> {
  const { data } = await supabase.rpc('mt_minhas_bancas')
  const rows = (data ?? []) as {
    banca_id: string
    slug: string
    nome: string
    nome_curto: string
    dias_para_prova: number | null
    ativa_agora: boolean
  }[]
  const escolhida = rows.find((b) => b.ativa_agora) ?? rows[0] ?? null
  if (!escolhida) return null
  return {
    bancaId: escolhida.banca_id,
    slug: escolhida.slug,
    nome: escolhida.nome,
    nomeCurto: escolhida.nome_curto,
    diasParaProva: escolhida.dias_para_prova,
  }
}
