import type { SupabaseClient } from '@supabase/supabase-js'

export type MinhaBanca = {
  bancaId: string
  slug: string
  nome: string
  nomeCurto: string
  dataProva: string | null
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
    data_prova: string | null
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
    dataProva: escolhida.data_prova,
    diasParaProva: escolhida.dias_para_prova,
  }
}

export type Arvore = {
  pontos: number
  estagio: { nome: string; emoji: string; frase: string }
  proximo: { nome: string; emoji: string; pontosMin: number } | null
  faltam: number
  progressoPct: number
  divida: number
  murchando: boolean
}

/** Árvore de pontos vitalícios (XP acumulado) — mt_xp_eventos, mesma fonte do mentortemi-web. */
export async function getArvore(supabase: SupabaseClient): Promise<Arvore | null> {
  const { data, error } = await supabase.rpc('mt_arvore')
  if (error || !data) return null
  const a = data as {
    pontos: number
    estagio: { nome: string; emoji: string; frase: string }
    proximo: { nome: string; emoji: string; pontos_min: number } | null
    faltam: number
    progresso_pct: number
    divida: number
    murchando: boolean
  }
  return {
    pontos: a.pontos,
    estagio: a.estagio,
    proximo: a.proximo ? { nome: a.proximo.nome, emoji: a.proximo.emoji, pontosMin: a.proximo.pontos_min } : null,
    faltam: a.faltam,
    progressoPct: a.progresso_pct,
    divida: a.divida,
    murchando: a.murchando,
  }
}

export type EngajamentoHoje = {
  questoesHoje: number
  flashcardsHoje: number
  metaQuestoes: number
  metaFlashcards: number
}

/** Meta diária 5+5 (questões SRS + flashcards) — reseta todo dia, separado da árvore. */
export async function getEngajamentoHoje(supabase: SupabaseClient): Promise<EngajamentoHoje | null> {
  const { data, error } = await supabase.rpc('mt_engajamento_hoje')
  if (error || !data) return null
  const e = data as {
    questoes_hoje: number
    flashcards_hoje: number
    meta_questoes: number
    meta_flashcards: number
  }
  return {
    questoesHoje: e.questoes_hoje,
    flashcardsHoje: e.flashcards_hoje,
    metaQuestoes: e.meta_questoes,
    metaFlashcards: e.meta_flashcards,
  }
}
