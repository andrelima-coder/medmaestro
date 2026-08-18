import type { SupabaseClient } from '@supabase/supabase-js'

// Agregados só do dashboard Início (Vertente 2 — matriculado). Reconcilia
// com a Figura 1 de referência: streak/meta/revisões pendentes/horas da
// semana no topo + "Metas da semana" com 4 metas reais.

function inicioSemana(): Date {
  const d = new Date()
  const dia = d.getDay() // 0=dom..6=sáb
  const diffParaSegunda = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diffParaSegunda)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Fila de revisão SRS pendente agora (mt_meu_painel.fila_hoje). */
export async function getRevisoesPendentes(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc('mt_meu_painel')
  if (error || !data) return 0
  return (data as { fila_hoje: number }).fila_hoje ?? 0
}

/** Streak calculado sobre atividade real de mentoria (SRS + sessões de foco), não sobre o funil legado. */
export async function getStreakMt(service: SupabaseClient, userId: string): Promise<number> {
  const { data } = await service.from('v_mt_dias_ativos').select('dia').eq('user_id', userId)
  const dias = new Set((data ?? []).map((r) => r.dia as string))
  if (dias.size === 0) return 0

  let streak = 0
  const d = new Date()
  const chave = () => d.toISOString().slice(0, 10)
  if (!dias.has(chave())) d.setDate(d.getDate() - 1)
  while (dias.has(chave())) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export type MetasSemana = {
  questoesRespondidas: number
  flashcardsRevisados: number
  simuladosConcluidos: number
  minutosEstudados: number
}

export type AtividadeItem = {
  tipo: 'simulado' | 'flashcards' | 'pratica'
  titulo: string
  detalhe: string
  destaque: string | null
  quando: string
}

type SimuladoAtividadeRow = {
  started_at: string
  attempt_results:
    | { score: number | null; finished_at: string | null }[]
    | { score: number | null; finished_at: string | null }
    | null
  campaigns: { name: string | null } | null
}

/**
 * Feed "Atividade recente" do Início: simulados entregues (1 item por attempt)
 * + prática e flashcards agrupados por dia, ordenados do mais novo ao mais antigo.
 */
export async function getAtividadeRecente(
  service: SupabaseClient,
  userId: string,
  limite = 4
): Promise<AtividadeItem[]> {
  const [simulados, flashcards, praticas] = await Promise.all([
    service
      .from('simulado_attempts')
      .select('started_at, attempt_results(score, finished_at), campaigns(name)')
      .eq('user_id', userId)
      .eq('status', 'entregue')
      .order('started_at', { ascending: false })
      .limit(3),
    service
      .from('mt_flashcard_review_log')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
    service
      .from('srs_review_log')
      .select('created_at, acerto')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const itens: AtividadeItem[] = []

  for (const r of (simulados.data ?? []) as unknown as SimuladoAtividadeRow[]) {
    const res = Array.isArray(r.attempt_results) ? r.attempt_results[0] : r.attempt_results
    itens.push({
      tipo: 'simulado',
      titulo: 'Simulado concluído',
      detalhe: r.campaigns?.name ?? 'Simulado',
      destaque: res?.score != null ? `${Math.round(Number(res.score))}% de acerto` : null,
      quando: res?.finished_at ?? r.started_at,
    })
  }

  // Rows chegam em ordem decrescente, então o primeiro de cada dia é o mais recente.
  const diasFlash = new Map<string, { n: number; ultimo: string }>()
  for (const r of flashcards.data ?? []) {
    const criado = r.created_at as string
    const dia = criado.slice(0, 10)
    const g = diasFlash.get(dia)
    if (g) g.n++
    else diasFlash.set(dia, { n: 1, ultimo: criado })
  }
  for (const g of diasFlash.values()) {
    itens.push({
      tipo: 'flashcards',
      titulo: 'Revisão de flashcards',
      detalhe: `${g.n} ${g.n === 1 ? 'cartão' : 'cartões'}`,
      destaque: null,
      quando: g.ultimo,
    })
  }

  const diasPratica = new Map<string, { n: number; acertos: number; ultimo: string }>()
  for (const r of praticas.data ?? []) {
    const criado = r.created_at as string
    const dia = criado.slice(0, 10)
    const g = diasPratica.get(dia)
    if (g) {
      g.n++
      if (r.acerto) g.acertos++
    } else {
      diasPratica.set(dia, { n: 1, acertos: r.acerto ? 1 : 0, ultimo: criado })
    }
  }
  for (const g of diasPratica.values()) {
    itens.push({
      tipo: 'pratica',
      titulo: 'Praticou questões avulsas',
      detalhe: 'Correção na hora',
      destaque: `${g.acertos}/${g.n} acertos`,
      quando: g.ultimo,
    })
  }

  itens.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime())
  return itens.slice(0, limite)
}

/** Contadores reais da semana corrente (segunda a agora) para o card "Metas da semana". */
export async function getMetasSemana(service: SupabaseClient, userId: string): Promise<MetasSemana> {
  const inicioISO = inicioSemana().toISOString()

  const [{ count: questoes }, { count: flashcards }, { count: simulados }, { data: sessoes }] = await Promise.all([
    service
      .from('srs_review_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', inicioISO),
    service
      .from('mt_flashcard_review_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', inicioISO),
    service
      .from('simulado_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'entregue')
      .gte('started_at', inicioISO),
    service.from('sessoes_estudo').select('minutos').eq('user_id', userId).gte('iniciada_em', inicioISO),
  ])

  const minutosEstudados = (sessoes ?? []).reduce((soma, s) => soma + ((s.minutos as number) ?? 0), 0)

  return {
    questoesRespondidas: questoes ?? 0,
    flashcardsRevisados: flashcards ?? 0,
    simuladosConcluidos: simulados ?? 0,
    minutosEstudados,
  }
}
