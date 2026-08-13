'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts'
import type { PrevisaoResult, TopicPrediction } from '@/lib/analytics/previsao'

const GOLD = '#D40754'
const MUTED = '#5F7288'
const LINE = 'rgba(14,40,65,0.06)'

// Cor por faixa de score (verde quente = mais provável).
function scoreColor(score: number): string {
  if (score >= 70) return '#D3402A'
  if (score >= 50) return '#F26B43'
  if (score >= 30) return '#9E6606'
  if (score >= 15) return '#006048'
  return '#5F7288'
}

function heatColor(share: number, max: number): string {
  if (share <= 0) return 'rgba(14,40,65,0.03)'
  const t = Math.min(1, share / (max || 1))
  // interpola de azul-escuro frio → dourado quente
  const r = Math.round(40 + t * (201 - 40))
  const g = Math.round(50 + t * (168 - 50))
  const b = Math.round(90 + t * (76 - 90))
  return `rgb(${r},${g},${b})`
}

function trendArrow(slope: number): { icon: string; color: string; label: string } {
  if (slope > 0.3) return { icon: '▲', color: '#D3402A', label: 'em alta' }
  if (slope < -0.3) return { icon: '▼', color: '#2B5A9C', label: 'em queda' }
  return { icon: '→', color: MUTED, label: 'estável' }
}

export function PrevisaoDashboard({ data }: { data: PrevisaoResult }) {
  const [dimension, setDimension] = useState(data.meta.dimension)
  const [topN, setTopN] = useState(20)

  const withData = useMemo(
    () => data.predictions.filter((p) => p.sampleSize > 0),
    [data.predictions]
  )
  const neverSeen = useMemo(
    () => data.predictions.filter((p) => p.sampleSize === 0),
    [data.predictions]
  )

  const top = useMemo(() => withData.slice(0, topN), [withData, topN])

  const heatMax = useMemo(() => {
    let m = 0
    for (const p of top) for (const b of p.byYear) if (b.share > m) m = b.share
    return m
  }, [top])

  // Dados do quadrante: X = share ponderado por recência, Y = tendência (pp/ano).
  const quadrant = useMemo(
    () =>
      withData
        .filter((p) => p.sampleSize >= 2)
        .map((p) => ({
          label: p.label,
          x: p.shareRecencyWeighted,
          y: p.trendSlope,
          z: p.sampleSize,
          score: p.score,
        })),
    [withData]
  )

  // Série de tendência dos 6 tópicos mais bem pontuados.
  const trendTop = useMemo(() => top.slice(0, 6), [top])
  const trendRows = useMemo(() => {
    return data.years.map((year) => {
      const row: Record<string, number> = { year }
      for (const p of trendTop) {
        const b = p.byYear.find((x) => x.year === year)
        row[p.label] = b ? Math.round(b.share * 10) / 10 : 0
      }
      return row
    })
  }, [data.years, trendTop])

  const trendColors = ['#D3402A', '#9E6606', '#2B5A9C', '#006048', '#7B3FA0', '#319498']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Aviso de qualidade do dado */}
      {data.meta.humanReviewedTagPct < 5 && (
        <div
          style={{
            background: 'rgba(251,174,64,0.08)',
            border: '1px solid rgba(251,174,64,0.25)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 12,
            color: '#9E6606',
            lineHeight: 1.5,
          }}
        >
          <strong>Atenção metodológica:</strong> apenas {data.meta.humanReviewedTagPct}% das
          classificações foram revisadas por humano — as previsões dependem da qualidade das tags
          geradas por IA. Trate os números como orientação de estudo, não como gabarito. Amostra:{' '}
          {data.years.length} provas ({data.years[0]}–{data.years[data.years.length - 1]}), prova
          média de {data.avgExamSize} questões.
        </div>
      )}

      {/* Controles */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: MUTED }}>Mostrar top</span>
        {[10, 20, 30].map((n) => (
          <button
            key={n}
            onClick={() => setTopN(n)}
            style={{
              fontSize: 11,
              padding: '4px 12px',
              borderRadius: 6,
              border: `1px solid ${topN === n ? GOLD : LINE}`,
              background: topN === n ? 'rgba(212,7,84,0.12)' : 'transparent',
              color: topN === n ? GOLD : MUTED,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {n}
          </button>
        ))}
        <span style={{ fontSize: 11, color: MUTED, marginLeft: 'auto' }}>
          {withData.length} tópicos com histórico · {neverSeen.length} nunca cobrados
        </span>
      </div>

      {/* 1) TABELA DE SCORE DE PREVISÃO */}
      <Section title="Ranking de previsão para a próxima prova" subtitle={`Score combina frequência recente, tendência e consistência. Projeção = nº esperado de questões (faixa).`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: MUTED, textAlign: 'left' }}>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Tópico</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Score</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Tendência</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Projeção 2026</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Amostra</th>
              </tr>
            </thead>
            <tbody>
              {top.map((p, i) => {
                const t = trendArrow(p.trendSlope)
                return (
                  <tr key={p.tagId} style={{ borderTop: `1px solid ${LINE}` }}>
                    <td style={{ ...tdStyle, color: MUTED }}>{i + 1}</td>
                    <td style={{ ...tdStyle, color: '#0E2841', maxWidth: 340 }}>{p.label}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          minWidth: 34,
                          padding: '2px 8px',
                          borderRadius: 20,
                          fontWeight: 700,
                          color: '#FFFFFF',
                          background: scoreColor(p.score),
                        }}
                      >
                        {p.score}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: t.color }}>
                      {t.icon} {p.trendSlope > 0 ? '+' : ''}
                      {p.trendSlope} pp/ano
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: '#0E2841' }}>
                      <strong>{p.projMid}</strong>
                      <span style={{ color: MUTED }}>
                        {' '}
                        ({p.projLo}–{p.projHi})
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: p.sampleSize < 4 ? '#9E6606' : MUTED }}>
                      {p.sampleSize}
                      {p.sampleSize < 4 ? ' ⚠' : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 2) HEATMAP tópico × ano */}
      <Section title="Mapa de calor — tópico × ano" subtitle="Cor = % da prova daquele ano. Faixas quentes contínuas = pilares perenes.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, position: 'sticky', left: 0, background: '#FFFFFF' }}></th>
                {data.years.map((y) => (
                  <th key={y} style={{ ...thStyle, textAlign: 'center', minWidth: 42 }}>
                    {String(y).slice(2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top.map((p) => (
                <tr key={p.tagId}>
                  <td
                    style={{
                      ...tdStyle,
                      position: 'sticky',
                      left: 0,
                      background: '#FFFFFF',
                      color: '#0E2841',
                      maxWidth: 240,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={p.label}
                  >
                    {p.label.length > 34 ? p.label.slice(0, 33) + '…' : p.label}
                  </td>
                  {p.byYear.map((b) => (
                    <td
                      key={b.year}
                      title={`${p.label} · ${b.year}: ${b.count} questões (${b.share.toFixed(1)}%)`}
                      style={{
                        textAlign: 'center',
                        padding: '6px 4px',
                        background: heatColor(b.share, heatMax),
                        color: b.share > heatMax * 0.5 ? '#FFFFFF' : MUTED,
                        fontWeight: b.count > 0 ? 600 : 400,
                        borderRadius: 3,
                      }}
                    >
                      {b.count || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 3) QUADRANTE peso × tendência */}
      <Section title="Peso × tendência" subtitle="Direita = pesa mais. Acima da linha = em alta. Quadrante superior-direito = aposta prioritária. Tamanho = amostra.">
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
            <CartesianGrid stroke={LINE} />
            <XAxis
              type="number"
              dataKey="x"
              name="Peso recente"
              unit="%"
              tick={{ fill: MUTED, fontSize: 11 }}
              label={{ value: 'Peso recente (% da prova)', position: 'bottom', fill: MUTED, fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Tendência"
              tick={{ fill: MUTED, fontSize: 11 }}
              label={{ value: 'Tendência (pp/ano)', angle: -90, position: 'insideLeft', fill: MUTED, fontSize: 11 }}
            />
            <ZAxis type="number" dataKey="z" range={[40, 400]} name="Amostra" />
            <ReferenceLine y={0} stroke={MUTED} strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ payload }) => {
                if (!payload || !payload.length) return null
                const d = payload[0].payload as { label: string; x: number; y: number; z: number; score: number }
                return (
                  <div style={{ background: '#FFFFFF', border: `1px solid ${LINE}`, borderRadius: 8, padding: 10, fontSize: 12, maxWidth: 240 }}>
                    <div style={{ color: '#0E2841', fontWeight: 600, marginBottom: 4 }}>{d.label}</div>
                    <div style={{ color: MUTED }}>Peso recente: {d.x}%</div>
                    <div style={{ color: MUTED }}>Tendência: {d.y > 0 ? '+' : ''}{d.y} pp/ano</div>
                    <div style={{ color: MUTED }}>Amostra: {d.z} questões</div>
                    <div style={{ color: GOLD }}>Score: {d.score}</div>
                  </div>
                )
              }}
            />
            <Scatter data={quadrant}>
              {quadrant.map((d, i) => (
                <Cell key={i} fill={scoreColor(d.score)} fillOpacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </Section>

      {/* 4) LINHAS DE TENDÊNCIA dos top-6 */}
      <Section title="Evolução dos 6 tópicos mais previstos" subtitle="% da prova por ano. Ajuda a distinguir tendência real de pico isolado.">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendRows} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
            <CartesianGrid stroke={LINE} />
            <XAxis dataKey="year" tick={{ fill: MUTED, fontSize: 11 }} />
            <YAxis tick={{ fill: MUTED, fontSize: 11 }} unit="%" />
            <Tooltip
              contentStyle={{ background: '#FFFFFF', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 11 }}
              formatter={(v) => `${v}%`}
            />
            {trendTop.map((p, i) => (
              <Line
                key={p.tagId}
                type="monotone"
                dataKey={p.label}
                stroke={trendColors[i % trendColors.length]}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
          {trendTop.map((p, i) => (
            <span key={p.tagId} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: MUTED }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: trendColors[i % trendColors.length] }} />
              {p.label.length > 40 ? p.label.slice(0, 39) + '…' : p.label}
            </span>
          ))}
        </div>
      </Section>

      {/* 5) GAPS DO EDITAL */}
      {neverSeen.length > 0 && (
        <Section title={`Tópicos do edital nunca cobrados (${neverSeen.length})`} subtitle="Ou a banca não cobra, ou são 'dívidas' que podem virar novidade — vigie os que entraram no edital recentemente.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {neverSeen.map((p) => (
              <span
                key={p.tagId}
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  borderRadius: 20,
                  border: `1px solid ${LINE}`,
                  background: 'rgba(14,40,65,0.02)',
                  color: MUTED,
                }}
              >
                {p.label}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--mm-surface, #FFFFFF)',
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0E2841', margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: 11.5, color: MUTED, margin: '3px 0 0', lineHeight: 1.5 }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  padding: '6px 10px',
}
const tdStyle: React.CSSProperties = { padding: '7px 10px' }
