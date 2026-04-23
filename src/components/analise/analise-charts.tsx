'use client'

import { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  LineChart,
  CartesianGrid,
  Legend,
} from 'recharts'

export type SpecByYear = {
  specialty: string
  year: number
  total: number
  approved: number
}

export type AnaliseChartsProps = {
  specByYear: SpecByYear[]
  years: number[]
  topSpecialties: string[]
}

const COLORS = [
  '#c9a84c', '#7c6fd8', '#4caf8a', '#e07b54', '#5b9bd8',
  '#d85b8a', '#8ac94c', '#d8c44c',
]

function useTooltipStyle() {
  return {
    contentStyle: {
      background: 'rgba(18,18,30,0.95)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px',
      fontSize: '12px',
      color: '#e0e0e0',
    },
    itemStyle: { color: '#e0e0e0' },
    labelStyle: { color: '#a0a0a0', marginBottom: 4 },
  }
}

// --- Gráfico 1: Barras por especialidade (filtro por ano) ---
function BarBySpecialty({ specByYear, years }: { specByYear: SpecByYear[]; years: number[] }) {
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all')
  const tt = useTooltipStyle()

  const data = useMemo(() => {
    const filtered = selectedYear === 'all'
      ? specByYear
      : specByYear.filter((r) => r.year === selectedYear)

    const map: Record<string, { name: string; total: number; approved: number }> = {}
    filtered.forEach((r) => {
      if (!map[r.specialty]) map[r.specialty] = { name: r.specialty, total: 0, approved: 0 }
      map[r.specialty].total += r.total
      map[r.specialty].approved += r.approved
    })
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .slice(0, 15)
  }, [specByYear, selectedYear])

  if (data.length === 0) return null

  return (
    <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Questões por especialidade</h2>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="h-7 rounded border border-white/8 bg-[var(--mm-surface)] px-2 text-xs text-foreground outline-none"
        >
          <option value="all">Todos os anos</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={data.length * 28 + 20} minHeight={120}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 11, fill: '#ccc' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            {...tt}
            formatter={(value, name) => [
              value,
              name === 'approved' ? 'Aprovadas' : 'Total',
            ]}
          />
          <Bar dataKey="total" fill="rgba(201,168,76,0.25)" radius={[0, 3, 3, 0]} name="Total" />
          <Bar dataKey="approved" fill="rgba(76,175,138,0.7)" radius={[0, 3, 3, 0]} name="Aprovadas" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// --- Gráfico 2: Curva de Pareto ---
function ParetoChart({ specByYear }: { specByYear: SpecByYear[] }) {
  const tt = useTooltipStyle()

  const data = useMemo(() => {
    const map: Record<string, number> = {}
    specByYear.forEach((r) => {
      map[r.specialty] = (map[r.specialty] ?? 0) + r.total
    })
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 20)
    const total = sorted.reduce((s, [, v]) => s + v, 0)
    let cum = 0
    return sorted.map(([name, count]) => {
      cum += count
      return {
        name: name.length > 18 ? name.slice(0, 18) + '…' : name,
        count,
        pareto: total > 0 ? Math.round((cum / total) * 100) : 0,
      }
    })
  }, [specByYear])

  if (data.length === 0) return null

  return (
    <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-5 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">Pareto — distribuição acumulada por especialidade</h2>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ left: 0, right: 24, top: 4, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#888' }}
            axisLine={false}
            tickLine={false}
            angle={-40}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: '#888' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => `${v}%`}
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#888' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            {...tt}
            formatter={(value, name) => [
              name === 'pareto' ? `${value}%` : value,
              name === 'pareto' ? 'Acumulado' : 'Questões',
            ]}
          />
          <Bar yAxisId="left" dataKey="count" fill="rgba(201,168,76,0.55)" radius={[3, 3, 0, 0]} name="count" />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="pareto"
            stroke="#7c6fd8"
            strokeWidth={2}
            dot={false}
            name="pareto"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted-foreground">A linha roxa mostra a porcentagem acumulada do total de questões.</p>
    </div>
  )
}

// --- Gráfico 3: Evolução por ano ---
function EvolutionChart({ specByYear, topSpecialties, years }: AnaliseChartsProps) {
  const tt = useTooltipStyle()

  const data = useMemo(() => {
    const top = topSpecialties.slice(0, 6)
    return years.map((year) => {
      const row: Record<string, number | string> = { year }
      top.forEach((spec) => {
        const found = specByYear.find((r) => r.year === year && r.specialty === spec)
        row[spec] = found?.total ?? 0
      })
      return row
    })
  }, [specByYear, topSpecialties, years])

  if (years.length < 2 || topSpecialties.length === 0) return null

  const top6 = topSpecialties.slice(0, 6)

  return (
    <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-5 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">Evolução por ano — top especialidades</h2>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ left: 0, right: 24, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ stroke: 'rgba(255,255,255,0.1)' }} {...tt} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#aaa', paddingTop: 8 }}
            formatter={(value) => value.length > 20 ? value.slice(0, 20) + '…' : value}
          />
          {top6.map((spec, i) => (
            <Line
              key={spec}
              type="monotone"
              dataKey={spec}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function AnaliseCharts(props: AnaliseChartsProps) {
  const { specByYear } = props
  if (specByYear.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      <BarBySpecialty specByYear={specByYear} years={props.years} />
      <ParetoChart specByYear={specByYear} />
      <EvolutionChart {...props} />
    </div>
  )
}
