'use client'

import { useMemo, useState } from 'react'
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Card, CardBody, CardHeader, CardTitle, ParetoBar } from '@/components/ui'
import { BarChart3, ChartPie, CircleDot } from 'lucide-react'

export type IncidenciaTemaRow = {
  question_id: string
  year: number
  board: string
  module_label: string
  module_color: string
}

export type IncidenciaTemaProps = {
  rows: IncidenciaTemaRow[]
  years: number[]
  boards: string[]
}

type ViewMode = 'bar' | 'pie' | 'donut'

const SELECT_CLASS =
  'h-7 rounded border border-white/10 bg-[var(--mm-surface)] px-2 text-xs text-foreground outline-none focus:border-[var(--mm-gold-border)]'

const TOGGLE_BTN =
  'flex h-7 w-7 items-center justify-center rounded border text-[var(--mm-muted)] transition-colors'
const TOGGLE_BTN_ACTIVE =
  'border-[var(--mm-gold-border)] bg-[var(--mm-gold-bg)] text-[var(--mm-gold)]'
const TOGGLE_BTN_IDLE =
  'border-white/10 bg-[var(--mm-surface)] hover:text-foreground'

export function IncidenciaTema({ rows, years, boards }: IncidenciaTemaProps) {
  const minYearAvail = years.length > 0 ? Math.min(...years) : new Date().getFullYear()
  const maxYearAvail = years.length > 0 ? Math.max(...years) : new Date().getFullYear()

  const [board, setBoard] = useState<string>('all')
  const [yearFrom, setYearFrom] = useState<number>(minYearAvail)
  const [yearTo, setYearTo] = useState<number>(maxYearAvail)
  const [view, setView] = useState<ViewMode>('bar')

  const data = useMemo(() => {
    const lo = Math.min(yearFrom, yearTo)
    const hi = Math.max(yearFrom, yearTo)
    const filtered = rows.filter(
      (r) =>
        (board === 'all' || r.board === board) &&
        r.year >= lo &&
        r.year <= hi
    )
    const map = new Map<string, { name: string; value: number; color: string }>()
    for (const r of filtered) {
      const existing = map.get(r.module_label)
      if (existing) {
        existing.value += 1
      } else {
        map.set(r.module_label, {
          name: r.module_label,
          value: 1,
          color: r.module_color,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value)
  }, [rows, board, yearFrom, yearTo])

  const total = data.reduce((s, d) => s + d.value, 0)
  const top8 = data.slice(0, 8)

  const isPie = view === 'pie' || view === 'donut'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Incidência por tema</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar por banca"
            value={board}
            onChange={(e) => setBoard(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="all">Todas as bancas</option>
            {boards.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <select
              aria-label="Ano inicial"
              value={yearFrom}
              onChange={(e) => setYearFrom(Number(e.target.value))}
              className={SELECT_CLASS}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-[var(--mm-muted)]">→</span>
            <select
              aria-label="Ano final"
              value={yearTo}
              onChange={(e) => setYearTo(Number(e.target.value))}
              className={SELECT_CLASS}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Visualizar em barras"
              aria-pressed={view === 'bar'}
              onClick={() => setView('bar')}
              className={`${TOGGLE_BTN} ${view === 'bar' ? TOGGLE_BTN_ACTIVE : TOGGLE_BTN_IDLE}`}
            >
              <BarChart3 className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Visualizar em pizza"
              aria-pressed={view === 'pie'}
              onClick={() => setView('pie')}
              className={`${TOGGLE_BTN} ${view === 'pie' ? TOGGLE_BTN_ACTIVE : TOGGLE_BTN_IDLE}`}
            >
              <ChartPie className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Visualizar em rosca"
              aria-pressed={view === 'donut'}
              onClick={() => setView('donut')}
              className={`${TOGGLE_BTN} ${view === 'donut' ? TOGGLE_BTN_ACTIVE : TOGGLE_BTN_IDLE}`}
            >
              <CircleDot className="size-3.5" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {total === 0 ? (
          <p className="py-10 text-center text-xs text-[var(--mm-muted)]">
            Nenhuma questão classificada com esses filtros
          </p>
        ) : view === 'bar' ? (
          <div className="flex flex-col gap-0.5">
            {top8.map((m) => {
              const pct = total > 0 ? Math.round((m.value / total) * 100) : 0
              return (
                <ParetoBar
                  key={m.name}
                  module={m.name}
                  count={m.value}
                  widthPct={pct}
                  percentLabel={`${pct}%`}
                  color={m.color}
                />
              )
            })}
            <p className="mt-2 text-center text-[11px] text-[var(--mm-muted)]">
              {total.toLocaleString('pt-BR')} classificações de módulo
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={isPie && view === 'donut' ? 60 : 0}
                  outerRadius={110}
                  paddingAngle={view === 'donut' ? 2 : 0}
                  stroke="rgba(0,0,0,0.4)"
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(18,18,30,0.95)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#e0e0e0',
                  }}
                  itemStyle={{ color: '#e0e0e0' }}
                  formatter={(value, name) => {
                    const n = Number(value ?? 0)
                    const pct = total > 0 ? Math.round((n / total) * 100) : 0
                    return [`${n} (${pct}%)`, String(name ?? '')]
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: '#aaa', paddingTop: 8 }}
                  formatter={(value) =>
                    typeof value === 'string' && value.length > 22
                      ? value.slice(0, 22) + '…'
                      : value
                  }
                />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-center text-[11px] text-[var(--mm-muted)]">
              {total.toLocaleString('pt-BR')} classificações de módulo
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
