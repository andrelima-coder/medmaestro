'use client'

import { useEffect, useState, type CSSProperties } from 'react'
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

/** true quando o usuário pediu menos movimento — desliga a animação JS do Recharts,
    que não é alcançada pelo guard CSS global de prefers-reduced-motion. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

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
  const reducedMotion = useReducedMotion()
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
        <Card titulo="Respondidas" valor={String(resumo.totalRespondidas)} stagger={0} />
        <Card titulo="Acerto geral" valor={`${resumo.pctGeral}%`} stagger={1} />
        <Card titulo="Ponto forte" valor={resumo.forte ? `${resumo.forte.pct}%` : '—'} sub={resumo.forte?.tagLabel} stagger={2} />
        <Card titulo="Ponto fraco" valor={resumo.fraco ? `${resumo.fraco.pct}%` : '—'} sub={resumo.fraco?.tagLabel} stagger={3} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Radar por módulo */}
        <section className="mm-animate-in rounded-2xl border border-border bg-card p-5 shadow-[var(--mm-shadow-sm)]">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Acerto por módulo</h2>
          {radarData.length >= 3 ? (
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar
                  dataKey="pct"
                  stroke="#006048"
                  fill="#006048"
                  fillOpacity={0.4}
                  isAnimationActive={!reducedMotion}
                  animationDuration={700}
                  animationEasing="ease-out"
                />
                <Tooltip formatter={(v) => `${v}%`} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <BarList items={modulos} />
          )}
        </section>

        {/* Evolução no tempo */}
        <section className="mm-animate-in rounded-2xl border border-border bg-card p-5 shadow-[var(--mm-shadow-sm)]" style={{ '--stagger': 1 } as CSSProperties}>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Evolução no tempo</h2>
          {lineData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Line
                  type="monotone"
                  dataKey="pct"
                  stroke="#206973"
                  strokeWidth={2}
                  isAnimationActive={!reducedMotion}
                  animationDuration={900}
                  animationEasing="ease-out"
                />
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
        <section className="mm-animate-in rounded-2xl border border-border bg-card p-5 shadow-[var(--mm-shadow-sm)]" style={{ '--stagger': 2 } as CSSProperties}>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Por eixo do edital</h2>
          <BarList items={edital} />
        </section>
      )}
    </div>
  )
}

function Card({ titulo, valor, sub, stagger = 0 }: { titulo: string; valor: string; sub?: string | null; stagger?: number }) {
  return (
    <div
      className="mm-animate-in mm-lift rounded-xl border border-border bg-card p-4 shadow-[var(--mm-shadow-sm)]"
      style={{ '--stagger': stagger } as CSSProperties}
    >
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
      {items.map((m, i) => (
        <li key={m.tagLabel}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-foreground">{m.tagLabel}</span>
            <span className="text-muted-foreground">
              {m.pct}% ({m.correct}/{m.total})
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-muted">
            <div
              className="mm-grow-x h-2 rounded"
              style={{
                width: `${m.pct}%`,
                background: m.pct >= 70 ? '#006048' : m.pct >= 40 ? '#9E6606' : '#D3402A',
                '--stagger': i,
              } as CSSProperties}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
