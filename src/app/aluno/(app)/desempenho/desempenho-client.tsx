'use client'

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { ModuleStat, TimelinePoint, Resumo } from '@/lib/analytics/desempenho'

export function DesempenhoClient({
  modulos,
  edital,
  timeline,
  resumo,
}: {
  modulos: ModuleStat[]
  edital: ModuleStat[]
  timeline: TimelinePoint[]
  resumo: Resumo
}) {
  const radarData = modulos.map((m) => ({ subject: m.tagLabel, pct: m.pct }))
  const lineData = timeline.map((t) => ({
    data: new Date(t.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    pct: t.pct,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Meu desempenho</h1>

      {/* Cartões de resumo */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card titulo="Respondidas" valor={String(resumo.totalRespondidas)} />
        <Card titulo="Acerto geral" valor={`${resumo.pctGeral}%`} />
        <Card titulo="Ponto forte" valor={resumo.forte ? `${resumo.forte.pct}%` : '—'} sub={resumo.forte?.tagLabel} />
        <Card titulo="Ponto fraco" valor={resumo.fraco ? `${resumo.fraco.pct}%` : '—'} sub={resumo.fraco?.tagLabel} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Radar por módulo */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Acerto por módulo</h2>
          {radarData.length >= 3 ? (
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar dataKey="pct" stroke="#006048" fill="#006048" fillOpacity={0.4} />
                <Tooltip formatter={(v) => `${v}%`} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <BarList items={modulos} />
          )}
        </section>

        {/* Evolução no tempo */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Evolução no tempo</h2>
          {lineData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Line type="monotone" dataKey="pct" stroke="#206973" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">
              Faça mais de um simulado para ver sua evolução.
            </p>
          )}
        </section>
      </div>

      {/* Eixos do edital */}
      {edital.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Por eixo do edital</h2>
          <BarList items={edital} />
        </section>
      )}
    </div>
  )
}

function Card({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className="mt-1 text-2xl font-bold text-foreground">{valor}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

function BarList({ items }: { items: ModuleStat[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Sem dados.</p>
  return (
    <ul className="space-y-2">
      {items.map((m) => (
        <li key={m.tagLabel}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-foreground">{m.tagLabel}</span>
            <span className="text-muted-foreground">
              {m.pct}% ({m.correct}/{m.total})
            </span>
          </div>
          <div className="h-2 w-full rounded bg-muted">
            <div
              className="h-2 rounded"
              style={{
                width: `${m.pct}%`,
                background: m.pct >= 70 ? '#006048' : m.pct >= 40 ? '#9E6606' : '#D3402A',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
