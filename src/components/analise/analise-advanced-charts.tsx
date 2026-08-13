'use client'

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  LabelList,
} from 'recharts'

// ---------------------------------------------------------------------------
// Contratos de dados (tudo já agregado no server — ver page.tsx)
// ---------------------------------------------------------------------------

export type PieDatum = { label: string; count: number; color: string }

export type AreaSeries = {
  years: number[]
  modulos: { label: string; color: string }[]
  /** Uma linha por ano: { year, [modulo]: contagem }. Normalizado p/ 100% no chart. */
  rows: Record<string, number>[]
}

export type BumpSeries = {
  years: number[]
  modulos: { label: string; color: string }[]
  /** Uma linha por ano: { year, [modulo]: rank (1 = mais incidente) }. */
  rows: Record<string, number>[]
}

export type QuadrantDatum = {
  modulo: string
  color: string
  /** Share médio (%) na janela. Eixo X. */
  shareAvg: number
  /** Variação em pontos percentuais (anos recentes − anos iniciais). Eixo Y. */
  trend: number
  total: number
}

export type HeatmapData = {
  modulos: string[]
  dificuldades: string[]
  cells: { modulo: string; dificuldade: string; count: number }[]
  max: number
}

export type AdvancedChartsProps = {
  pieDif: PieDatum[]
  pieTipo: PieDatum[]
  area: AreaSeries
  bump: BumpSeries
  quadrant: QuadrantDatum[]
  heatmap: HeatmapData
  windowLabel: string
}

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'rgba(255,255,255,0.96)',
    border: '1px solid rgba(14,40,65,0.08)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#A4A3A4',
  },
  itemStyle: { color: '#A4A3A4' },
  labelStyle: { color: '#5F7288', marginBottom: 4 },
} as const

function ChartCard({
  title,
  badge,
  hint,
  children,
}: {
  title: string
  badge?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--mm-border-default)] bg-[var(--mm-surface)]/60 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-syne)] text-sm font-bold text-foreground">
          {title}
        </h2>
        {badge && (
          <span className="rounded-full border border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--mm-gold)]">
            {badge}
          </span>
        )}
      </div>
      {children}
      {hint && <p className="text-[11px] leading-[1.5] text-[var(--mm-muted)]">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pizza (rosca) — composição
// ---------------------------------------------------------------------------

function DonutChart({ data, centerLabel }: { data: PieDatum[]; centerLabel: string }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  if (total === 0) return null
  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={52}
          outerRadius={82}
          paddingAngle={2}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth={1}
        >
          {data.map((d) => (
            <Cell key={d.label} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value, name) => {
            const v = Number(value)
            return [`${v} (${Math.round((v / total) * 100)}%)`, String(name)]
          }}
        />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: '#5F7288' }}
          formatter={(v: string) => {
            const d = data.find((x) => x.label === v)
            const pct = d ? Math.round((d.count / total) * 100) : 0
            return `${v} · ${pct}%`
          }}
        />
        <text
          x="50%"
          y="44%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#0E2841"
          fontSize={20}
          fontWeight={700}
        >
          {total}
        </text>
        <text
          x="50%"
          y="55%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#5F7288"
          fontSize={10}
        >
          {centerLabel}
        </text>
      </PieChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Stacked Area 100% — composição por ano (share normalizado)
// ---------------------------------------------------------------------------

function StackedAreaShare({ area }: { area: AreaSeries }) {
  if (area.years.length < 2) {
    return (
      <p className="py-10 text-center text-xs text-[var(--mm-muted)]">
        São necessários ao menos 2 anos na janela para a série temporal.
      </p>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={area.rows} stackOffset="expand" margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(14,40,65,0.05)" />
        <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#5F7288' }} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          tick={{ fontSize: 10, fill: '#5F7288' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value, name, item) => {
            const v = Number(value)
            const row = ((item as { payload?: Record<string, number> } | undefined)?.payload ??
              {}) as Record<string, number>
            const sum = area.modulos.reduce((s, m) => s + (row[m.label] ?? 0), 0)
            const pct = sum > 0 ? Math.round((v / sum) * 100) : 0
            return [`${v} (${pct}%)`, String(name)]
          }}
        />
        {area.modulos.map((m) => (
          <Area
            key={m.label}
            type="monotone"
            dataKey={m.label}
            stackId="1"
            stroke={m.color}
            fill={m.color}
            fillOpacity={0.78}
            strokeWidth={0.5}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Bump chart — ranking de incidência ao longo do tempo
// ---------------------------------------------------------------------------

function BumpChart({ bump }: { bump: BumpSeries }) {
  if (bump.years.length < 2) {
    return (
      <p className="py-10 text-center text-xs text-[var(--mm-muted)]">
        São necessários ao menos 2 anos na janela para o ranking.
      </p>
    )
  }
  const n = bump.modulos.length
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={bump.rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(14,40,65,0.05)" />
        <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#5F7288' }} axisLine={false} tickLine={false} />
        <YAxis
          reversed
          domain={[1, n]}
          ticks={Array.from({ length: n }, (_, i) => i + 1)}
          tickFormatter={(v: number) => `${v}º`}
          tick={{ fontSize: 10, fill: '#5F7288' }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value, name) => [`${Number(value)}º`, String(name)]}
        />
        {bump.modulos.map((m) => (
          <Line
            key={m.label}
            type="monotone"
            dataKey={m.label}
            stroke={m.color}
            strokeWidth={2}
            dot={{ r: 3, fill: m.color }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Quadrante Incidência × Tendência
// ---------------------------------------------------------------------------

function QuadrantScatter({ data }: { data: QuadrantDatum[] }) {
  const midX = useMemo(() => {
    if (data.length === 0) return 0
    return data.reduce((s, d) => s + d.shareAvg, 0) / data.length
  }, [data])

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart margin={{ left: 4, right: 16, top: 12, bottom: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(14,40,65,0.05)" />
        <XAxis
          type="number"
          dataKey="shareAvg"
          name="Incidência média"
          unit="%"
          tick={{ fontSize: 10, fill: '#5F7288' }}
          axisLine={false}
          tickLine={false}
          label={{ value: 'Incidência média (%)', position: 'insideBottom', offset: -8, fontSize: 10, fill: '#5F7288' }}
        />
        <YAxis
          type="number"
          dataKey="trend"
          name="Tendência"
          unit="pp"
          tick={{ fontSize: 10, fill: '#5F7288' }}
          axisLine={false}
          tickLine={false}
          label={{ value: 'Tendência (pp)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#5F7288' }}
        />
        <ZAxis type="number" dataKey="total" range={[60, 400]} name="Total" />
        <ReferenceLine y={0} stroke="rgba(14,40,65,0.18)" strokeDasharray="4 3" />
        <ReferenceLine x={midX} stroke="rgba(14,40,65,0.18)" strokeDasharray="4 3" />
        <Tooltip
          {...TOOLTIP_STYLE}
          cursor={{ strokeDasharray: '3 3', stroke: 'rgba(14,40,65,0.15)' }}
          formatter={(value, name) => {
            const v = Number(value)
            if (name === 'Incidência média') return [`${v.toFixed(1)}%`, String(name)]
            if (name === 'Tendência') return [`${v > 0 ? '+' : ''}${v.toFixed(1)} pp`, String(name)]
            return [String(value), String(name)]
          }}
        />
        <Scatter data={data} name="Módulos">
          {data.map((d) => (
            <Cell key={d.modulo} fill={d.color} />
          ))}
          <LabelList
            dataKey="modulo"
            position="top"
            style={{ fontSize: 9, fill: '#5F7288' }}
            formatter={(v) => {
              const s = String(v ?? '')
              return s.length > 14 ? s.slice(0, 13) + '…' : s
            }}
          />
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Heatmap Dificuldade × Módulo (grid CSS — Recharts não tem heatmap nativo)
// ---------------------------------------------------------------------------

function HeatmapGrid({ heatmap }: { heatmap: HeatmapData }) {
  const lookup = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of heatmap.cells) m[`${c.modulo}__${c.dificuldade}`] = c.count
    return m
  }, [heatmap])

  if (heatmap.modulos.length === 0) return null

  const cellColor = (count: number) => {
    if (count === 0) return 'rgba(14,40,65,0.03)'
    const t = heatmap.max > 0 ? count / heatmap.max : 0
    // gold → orange → vermelho conforme intensidade
    const alpha = 0.15 + t * 0.8
    return `rgba(255,107,53,${alpha.toFixed(3)})`
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--mm-muted)]">
              Módulo
            </th>
            {heatmap.dificuldades.map((d) => (
              <th
                key={d}
                className="px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--mm-muted)]"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heatmap.modulos.map((mod) => (
            <tr key={mod}>
              <td className="whitespace-nowrap py-1 pr-2 text-[11px] text-[var(--mm-text2)]">{mod}</td>
              {heatmap.dificuldades.map((dif) => {
                const count = lookup[`${mod}__${dif}`] ?? 0
                return (
                  <td
                    key={dif}
                    className="rounded-md text-center text-[11px] font-semibold text-foreground"
                    style={{ background: cellColor(count), minWidth: 56, height: 30 }}
                    title={`${mod} · ${dif}: ${count} questões`}
                  >
                    {count > 0 ? count : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composição final
// ---------------------------------------------------------------------------

export function AnaliseAdvancedCharts(props: AdvancedChartsProps) {
  const { pieDif, pieTipo, area, bump, quadrant, heatmap, windowLabel } = props

  return (
    <div className="flex flex-col gap-4">
      {/* Quadrante — decisão central de priorização */}
      <ChartCard
        title="Quadrante de priorização — Incidência × Tendência"
        badge={windowLabel}
        hint="Direita = mais incide na prova. Acima da linha = está subindo. Tamanho da bolha = volume total. Foco máximo: alta incidência + subindo (quadrante superior direito)."
      >
        <QuadrantScatter data={quadrant} />
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Stacked area 100% */}
        <ChartCard
          title="Composição da prova por ano (100%)"
          badge={windowLabel}
          hint="Share de cada módulo no total do ano — normalizado, então mais cadernos num ano não distorcem a leitura."
        >
          <StackedAreaShare area={area} />
        </ChartCard>

        {/* Bump ranking */}
        <ChartCard
          title="Ranking de incidência ao longo do tempo"
          badge={windowLabel}
          hint="Posição de cada módulo no ranking de incidência, ano a ano. Linhas que sobem = módulos ganhando peso na banca."
        >
          <BumpChart bump={bump} />
        </ChartCard>

        {/* Pizza dificuldade */}
        <ChartCard
          title="Composição por dificuldade"
          hint="Perfil de exigência da banca no recorte filtrado."
        >
          <DonutChart data={pieDif} centerLabel="questões" />
        </ChartCard>

        {/* Pizza tipo */}
        <ChartCard
          title="Composição por tipo de questão"
          hint="O que a banca cobra: conduta, diagnóstico, fisiopatologia, interpretação, farmacologia."
        >
          <DonutChart data={pieTipo} centerLabel="questões" />
        </ChartCard>
      </div>

      {/* Heatmap dificuldade × módulo */}
      <ChartCard
        title="Mapa de calor — Dificuldade × Módulo"
        hint="Onde estão concentradas as questões difíceis. Quanto mais quente a célula, mais questões. Cruze com a incidência para achar onde o aluno mais sofre E mais cai."
      >
        <HeatmapGrid heatmap={heatmap} />
      </ChartCard>
    </div>
  )
}
