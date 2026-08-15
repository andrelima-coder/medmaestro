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
