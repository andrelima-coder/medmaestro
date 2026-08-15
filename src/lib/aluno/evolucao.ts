import type { SupabaseClient } from '@supabase/supabase-js'

// Dashboard "Evolução" (mentoria — porte do mentortemi-web). Página somente
// leitura: todas as RPCs são SECURITY DEFINER via auth.uid(), chamadas pelo
// cliente autenticado. Sem mutação — por isso a página inteira é Server
// Component, sem o risco de dessincronia de estado que existe em
// Revisar/Flashcards.

export type TrilhaEstagio = {
  ordem: number
  slug: string
  nome: string
  pontosMin: number
  atingido: boolean
}

export async function getTrilha(supabase: SupabaseClient): Promise<TrilhaEstagio[]> {
  const { data, error } = await supabase.rpc('mt_estagios_trilha')
  if (error || !data) return []
  const rows = data as { ordem: number; slug: string; nome: string; pontos_min: number; atingido: boolean }[]
  return rows.map((r) => ({ ordem: r.ordem, slug: r.slug, nome: r.nome, pontosMin: r.pontos_min, atingido: r.atingido }))
}

export type Semana = {
  ativos: number
  plantoes: number
  meta: number
  cumprida: boolean
  plantoesRestantesMes: number
  dias: { dia: string; ativo: boolean; plantao: boolean }[]
}

export async function getSemana(supabase: SupabaseClient): Promise<Semana | null> {
  const { data, error } = await supabase.rpc('mt_semana')
  if (error || !data) return null
  const s = data as {
    ativos: number
    plantoes: number
    meta: number
    cumprida: boolean
    plantoes_restantes_mes: number
    dias: { dia: string; ativo: boolean; plantao: boolean }[]
  }
  return {
    ativos: s.ativos,
    plantoes: s.plantoes,
    meta: s.meta,
    cumprida: s.cumprida,
    plantoesRestantesMes: s.plantoes_restantes_mes,
    dias: s.dias,
  }
}

export type ModuloDesempenho = {
  moduloSlug: string
  modulo: string
  pesoPct: number
  respostas: number
  acertoPct: number
  metaPct: number
  gap: number
  coberturaPct: number
}

export async function getDesempenhoModulo(supabase: SupabaseClient): Promise<ModuloDesempenho[]> {
  const { data, error } = await supabase.rpc('mt_desempenho_modulo')
  if (error || !data) return []
  const rows = data as {
    modulo_slug: string
    modulo: string
    peso_pct: number
    respostas: number
    acerto_pct: number
    meta_pct: number
    gap: number
    cobertura_pct: number
  }[]
  return rows.map((r) => ({
    moduloSlug: r.modulo_slug,
    modulo: r.modulo,
    pesoPct: r.peso_pct,
    respostas: r.respostas,
    acertoPct: r.acerto_pct,
    metaPct: r.meta_pct,
    gap: r.gap,
    coberturaPct: r.cobertura_pct,
  }))
}

export type CustoOportunidade =
  | { temAlerta: true; modulo: string; minutos: number; pesoPct: number; sugestao: string }
  | { temAlerta: false }

export async function getCustoOportunidade(supabase: SupabaseClient, dias = 7): Promise<CustoOportunidade> {
  const { data, error } = await supabase.rpc('mt_custo_oportunidade', { p_dias: dias })
  if (error || !data) return { temAlerta: false }
  const c = data as { tem_alerta: boolean; modulo?: string; minutos?: number; peso_pct?: number; sugestao?: string }
  if (!c.tem_alerta) return { temAlerta: false }
  return { temAlerta: true, modulo: c.modulo as string, minutos: c.minutos as number, pesoPct: c.peso_pct as number, sugestao: c.sugestao as string }
}

export type Percentil = { percentil: number | null; alunosComparados: number; acertoPct: number | null }

export async function getPercentil(supabase: SupabaseClient): Promise<Percentil | null> {
  const { data, error } = await supabase.rpc('mt_percentil')
  if (error || !data) return null
  const p = data as { percentil: number | null; alunos_comparados: number; acerto_pct: number | null }
  return { percentil: p.percentil, alunosComparados: p.alunos_comparados, acertoPct: p.acerto_pct }
}

export type Eficiencia = {
  minutosTotal: number
  respostas: number
  acertoPct: number | null
  eficiencia: number | null
} | null

export async function getEficiencia(supabase: SupabaseClient, inicio: string, fim: string): Promise<Eficiencia> {
  const { data, error } = await supabase.rpc('calcular_eficiencia', { p_inicio: inicio, p_fim: fim })
  if (error || !data) return null
  const e = data as { minutos_total: number; respostas: number; acerto_pct: number | null; eficiencia: number | null }
  return { minutosTotal: e.minutos_total, respostas: e.respostas, acertoPct: e.acerto_pct, eficiencia: e.eficiencia }
}

export type ErroCaderno = {
  conceitoId: string
  proposicao: string
  modulo: string
  erros: number
  pontosCegos: number
  tipo: 'ponto_cego' | 'leech' | 'lacuna_assumida'
}

export async function getCadernoErros(supabase: SupabaseClient, limite = 60): Promise<ErroCaderno[]> {
  const { data, error } = await supabase.rpc('mt_caderno_erros', { p_limite: limite })
  if (error || !data) return []
  const rows = data as {
    conceito_id: string
    proposicao: string
    modulo: string
    erros: number
    pontos_cegos: number
    tipo: string
  }[]
  return rows.map((r) => ({
    conceitoId: r.conceito_id,
    proposicao: r.proposicao,
    modulo: r.modulo,
    erros: r.erros,
    pontosCegos: r.pontos_cegos,
    tipo: r.tipo as ErroCaderno['tipo'],
  }))
}

export type DiarioErro = {
  total: number
  conteudo: number
  skillProva: number
  porCausa: Record<string, number>
} | null

export async function getDiarioErro(supabase: SupabaseClient, dias = 30): Promise<DiarioErro> {
  const { data, error } = await supabase.rpc('mt_diario_erro', { p_dias: dias })
  if (error || !data) return null
  const d = data as { total: number; conteudo: number; skill_prova: number; por_causa: Record<string, number> }
  if (!d.total) return null
  return { total: d.total, conteudo: d.conteudo, skillProva: d.skill_prova, porCausa: d.por_causa ?? {} }
}

export type Desafio = { slug: string; titulo: string; descricao: string; alvo: number; atual: number; pontos: number }

export async function getDesafios(supabase: SupabaseClient): Promise<Desafio[]> {
  const { data, error } = await supabase.rpc('mt_desafios')
  if (error || !data) return []
  return data as Desafio[]
}

export type EventoRecente = {
  tipo: string
  pontos: number
  quando: string
  conceito: string | null
  modulo: string | null
}

export async function getEventosRecentes(supabase: SupabaseClient, limite = 12): Promise<EventoRecente[]> {
  const { data, error } = await supabase.rpc('mt_eventos_recentes', { p_limite: limite })
  if (error || !data) return []
  return data as EventoRecente[]
}
