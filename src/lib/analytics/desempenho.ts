import type { SupabaseClient } from '@supabase/supabase-js'

// Leitura de desempenho do aluno (feature 002 — A005).
// Lê dos agregados materializados (student_module_stats) e de attempt_results.
// Usa o client de sessão (RLS aplica: aluno só vê o próprio).

export type ModuleStat = {
  tagLabel: string
  correct: number
  total: number
  pct: number
}

export type TimelinePoint = {
  date: string
  pct: number
  campaign: string
}

export type Resumo = {
  totalRespondidas: number
  pctGeral: number
  forte: ModuleStat | null
  fraco: ModuleStat | null
}

type Releases = { nota_gabarito?: boolean; dashboard?: boolean } | null

/** % de acerto por tag de uma dimensão (modulo | topico_edital). */
export async function getModuleStats(
  supabase: SupabaseClient,
  userId: string,
  dimension: 'modulo' | 'topico_edital'
): Promise<ModuleStat[]> {
  const { data } = await supabase
    .from('student_module_stats')
    .select('tag_label, correct, total')
    .eq('user_id', userId)
    .eq('dimension', dimension)
    .order('total', { ascending: false })

  return (data ?? []).map((r) => ({
    tagLabel: r.tag_label ?? '—',
    correct: r.correct,
    total: r.total,
    pct: r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0,
  }))
}

/** Resumo a partir do radar de módulos. */
export function resumoFromModules(modules: ModuleStat[]): Resumo {
  const total = modules.reduce((s, m) => s + m.total, 0)
  const correct = modules.reduce((s, m) => s + m.correct, 0)
  const ordered = [...modules].filter((m) => m.total > 0).sort((a, b) => b.pct - a.pct)
  return {
    totalRespondidas: total,
    pctGeral: total > 0 ? Math.round((correct / total) * 100) : 0,
    forte: ordered[0] ?? null,
    fraco: ordered.length ? ordered[ordered.length - 1] : null,
  }
}

type AttemptRow = {
  campaign_id: string
  attempt_results: { score: number | null; finished_at: string | null }[] | null
  campaigns: { name: string | null; releases: Releases } | null
}

/**
 * Evolução no tempo (só campanhas com gabarito liberado) e flag de acesso ao
 * dashboard (alguma campanha do aluno com releases.dashboard = true).
 */
export async function getTimelineAndAccess(
  supabase: SupabaseClient,
  userId: string
): Promise<{ timeline: TimelinePoint[]; hasDashboardAccess: boolean }> {
  const { data } = await supabase
    .from('simulado_attempts')
    .select('campaign_id, attempt_results(score, finished_at), campaigns(name, releases)')
    .eq('user_id', userId)

  const rows = (data ?? []) as unknown as AttemptRow[]
  let hasDashboardAccess = false
  const timeline: TimelinePoint[] = []

  for (const r of rows) {
    const rel = r.campaigns?.releases ?? null
    if (rel?.dashboard) hasDashboardAccess = true
    const res = r.attempt_results?.[0]
    if (rel?.nota_gabarito && res?.score != null && res.finished_at) {
      timeline.push({
        date: res.finished_at,
        pct: Math.round(Number(res.score)),
        campaign: r.campaigns?.name ?? 'Simulado',
      })
    }
  }

  timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  return { timeline, hasDashboardAccess }
}
