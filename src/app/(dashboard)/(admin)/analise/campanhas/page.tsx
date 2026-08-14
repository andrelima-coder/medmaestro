import { createServiceClient } from '@/lib/supabase/service'
import { RefreshButton } from './refresh-button'

export const metadata = { title: 'Analytics por campanha — MedMaestro' }

type ModuleAgg = { tag_label: string | null; correct: number; total: number }

export default async function AnalyticsCampanhasPage() {
  const service = createServiceClient()

  const { data: campaigns } = await service
    .from('campaigns')
    .select('id, name, status')
    .order('created_at', { ascending: false })
    .limit(50)

  const rows = await Promise.all(
    (campaigns ?? []).map(async (c) => {
      const { data: attempts } = await service
        .from('simulado_attempts')
        .select('status')
        .eq('campaign_id', c.id)
      const total = attempts?.length ?? 0
      const entregues = (attempts ?? []).filter(
        (a) => a.status === 'entregue' || a.status === 'expirado'
      ).length

      const { data: results } = await service
        .from('attempt_results')
        .select('score, simulado_attempts!inner(campaign_id)')
        .eq('simulado_attempts.campaign_id', c.id)
      const scores = (results ?? [])
        .map((r) => (r.score == null ? null : Number(r.score)))
        .filter((n): n is number => n != null)
      const avg = scores.length
        ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length)
        : null

      const { data: mods } = await service
        .from('campaign_module_stats')
        .select('tag_label, correct, total')
        .eq('campaign_id', c.id)
        .eq('dimension', 'modulo')
      const piores = ((mods ?? []) as ModuleAgg[])
        .filter((m) => m.total > 0)
        .map((m) => ({ label: m.tag_label ?? '—', pct: Math.round((m.correct / m.total) * 100) }))
        .sort((a, b) => a.pct - b.pct)
        .slice(0, 3)

      return { c, total, entregues, avg, piores }
    })
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics por campanha</h1>
          <p className="text-sm text-muted-foreground">
            Conclusão, nota média e módulos com menor acerto. Lê dos agregados materializados.
          </p>
        </div>
        <RefreshButton />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma campanha ainda.</p>
      ) : (
        <div className="space-y-4">
          {rows.map(({ c, total, entregues, avg, piores }) => (
            <div key={c.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-foreground">{c.name}</h2>
                <span className="text-xs text-muted-foreground">{c.status}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat titulo="Tentativas" valor={String(total)} />
                <Stat titulo="Concluídas" valor={String(entregues)} />
                <Stat
                  titulo="Conclusão"
                  valor={total > 0 ? `${Math.round((entregues / total) * 100)}%` : '—'}
                />
                <Stat titulo="Nota média" valor={avg != null ? `${avg}%` : '—'} />
              </div>
              {piores.length > 0 && (
                <div className="mt-4">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">
                    Módulos com menor acerto
                  </div>
                  <ul className="space-y-1 text-sm">
                    {piores.map((p) => (
                      <li key={p.label} className="flex justify-between">
                        <span className="text-foreground">{p.label}</span>
                        <span className="text-[#D3402A]">{p.pct}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className="mt-0.5 text-lg font-bold text-foreground">{valor}</div>
    </div>
  )
}
