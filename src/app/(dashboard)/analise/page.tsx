import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Análise — MedMaestro' }

const ROLE_RANK: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }

const MODULO_COLORS: Record<string, string> = {
  Cardiovascular: '#EF5350',
  Respiratório: '#42A5F5',
  Neurológico: '#AB47BC',
  'Renal e Distúrbios HE': '#26A69A',
  'Infectologia e Sepse': '#FF7043',
  'Gastro e Nutrição': '#66BB6A',
  'Hemato e Oncologia': '#EC407A',
  'Trauma e Cirurgia': '#8D6E63',
  'Medicina Perioperatória': '#FFA726',
  'Ética e Qualidade': '#78909C',
}

type SearchParams = { year?: string }

function buildYearUrl(year: string): string {
  if (!year) return '/analise'
  return `/analise?year=${year}`
}

export default async function AnalisePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const yearFilter = params.year ? parseInt(params.year) : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if ((ROLE_RANK[profile?.role ?? ''] ?? -1) < ROLE_RANK['admin']) redirect('/dashboard')

  // Carrega dados em paralelo
  const [modTagsRes, temasTagsRes, yearsRes, allExamsRes] = await Promise.all([
    service
      .from('question_tags')
      .select('question_id, tags!inner(label, color, dimension)')
      .eq('tags.dimension', 'modulo'),
    service
      .from('question_tags')
      .select('question_id, tags!inner(label, dimension)')
      .eq('tags.dimension', 'topico_edital'),
    service.from('exams').select('id, year').order('year', { ascending: false }),
    service.from('exams').select('id, year'),
  ])

  const allYears = [...new Set((yearsRes.data ?? []).map((e) => e.year as number))].sort(
    (a, b) => b - a
  )

  // Constrói mapa exam_id → year para filtro
  const examYearMap: Record<string, number> = {}
  for (const e of allExamsRes.data ?? []) {
    examYearMap[e.id as string] = e.year as number
  }

  // Filtra tags pelo ano se necessário
  let modTags = modTagsRes.data ?? []
  let temasTags = temasTagsRes.data ?? []

  if (yearFilter) {
    // Busca questões do ano filtrado
    const { data: examIds } = await service
      .from('exams')
      .select('id')
      .eq('year', yearFilter)
    const eidSet = new Set((examIds ?? []).map((e) => e.id as string))
    const { data: qInYear } = await service
      .from('questions')
      .select('id')
      .in('exam_id', [...eidSet])
    const qidSet = new Set((qInYear ?? []).map((q) => q.id as string))
    modTags = modTags.filter((t) => qidSet.has(t.question_id as string))
    temasTags = temasTags.filter((t) => qidSet.has(t.question_id as string))
  }

  const totalTagged = modTags.length

  // Agrupa por módulo
  const moduloCount: Record<string, { color: string; count: number }> = {}
  for (const row of modTags) {
    const tag = row.tags as unknown as { label: string; color: string | null } | null
    if (!tag) continue
    const key = tag.label
    const color =
      tag.color ?? MODULO_COLORS[key] ?? '#5A6880'
    if (!moduloCount[key]) moduloCount[key] = { color, count: 0 }
    moduloCount[key].count++
  }

  const modulosData = Object.entries(moduloCount)
    .map(([label, { color, count }]) => ({ label, color, count }))
    .sort((a, b) => b.count - a.count)

  const maxCount = Math.max(...modulosData.map((m) => m.count), 1)

  // Curva acumulada Pareto
  const cumulativePoints: number[] = []
  let cumSum = 0
  for (const m of modulosData) {
    cumSum += m.count
    cumulativePoints.push(totalTagged > 0 ? (cumSum / totalTagged) * 100 : 0)
  }
  const svgCurvePts = modulosData
    .map((_, i) => {
      const x = ((i + 0.5) / Math.max(modulosData.length, 1)) * 100
      const y = 100 - cumulativePoints[i]
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  // Top 3 para insight Pareto
  const top3Count = modulosData.slice(0, 3).reduce((s, m) => s + m.count, 0)
  const paretoAlert = totalTagged > 0 && top3Count / totalTagged > 0.5

  // Agrupa por tema (topico_edital)
  const temaCount: Record<string, { count: number; modulo: string | null }> = {}
  for (const row of temasTags) {
    const tag = row.tags as unknown as { label: string; dimension: string } | null
    if (!tag) continue
    if (!temaCount[tag.label]) temaCount[tag.label] = { count: 0, modulo: null }
    temaCount[tag.label].count++
  }

  const top20Temas = Object.entries(temaCount)
    .map(([label, { count }]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  // Evolução temporal: módulos por ano (se não há filtro de ano)
  type ModuloYearRow = { modulo: string; color: string; countByYear: Record<number, number>; total: number }
  const moduloYearData: Record<string, ModuloYearRow> = {}

  if (!yearFilter && allYears.length > 0) {
    // Busca todas as question_tags com modulo + exam_id das questões
    const { data: qExamRows } = await service
      .from('questions')
      .select('id, exam_id')
    const qExamMap: Record<string, string> = {}
    for (const q of qExamRows ?? []) {
      qExamMap[q.id as string] = q.exam_id as string
    }

    for (const row of modTagsRes.data ?? []) {
      const tag = row.tags as unknown as { label: string; color: string | null } | null
      if (!tag) continue
      const qid = row.question_id as string
      const examId = qExamMap[qid]
      if (!examId) continue
      const year = examYearMap[examId]
      if (!year) continue
      const color = tag.color ?? MODULO_COLORS[tag.label] ?? '#5A6880'
      if (!moduloYearData[tag.label]) {
        moduloYearData[tag.label] = { modulo: tag.label, color, countByYear: {}, total: 0 }
      }
      moduloYearData[tag.label].countByYear[year] =
        (moduloYearData[tag.label].countByYear[year] ?? 0) + 1
      moduloYearData[tag.label].total++
    }
  }

  const yearsForChart = allYears.slice(0, 6)
  const topModulosByYear = Object.values(moduloYearData)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
    .map((m) => ({
      ...m,
      maxYearCount: Math.max(...yearsForChart.map((y) => m.countByYear[y] ?? 0), 1),
    }))

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1
          className="font-[family-name:var(--font-syne)]"
          style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
        >
          Análise 80/20
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
          Distribuição e incidência por módulo — Regra de Pareto
        </p>
      </div>

      {/* Chips de filtro por ano */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link
          href="/analise"
          style={{
            padding: '5px 14px',
            borderRadius: 20,
            fontSize: 11,
            textDecoration: 'none',
            border: !yearFilter ? '1px solid var(--mm-gold-border)' : '1px solid var(--mm-line2)',
            background: !yearFilter ? 'var(--mm-gold-bg)' : 'transparent',
            color: !yearFilter ? 'var(--mm-gold)' : 'var(--mm-text2)',
            fontWeight: !yearFilter ? 600 : 400,
          }}
        >
          Todas as provas
        </Link>
        {allYears.map((y) => (
          <Link
            key={y}
            href={buildYearUrl(String(y))}
            style={{
              padding: '5px 14px',
              borderRadius: 20,
              fontSize: 11,
              textDecoration: 'none',
              border:
                yearFilter === y
                  ? '1px solid var(--mm-gold-border)'
                  : '1px solid var(--mm-line2)',
              background: yearFilter === y ? 'var(--mm-gold-bg)' : 'transparent',
              color: yearFilter === y ? 'var(--mm-gold)' : 'var(--mm-text2)',
              fontWeight: yearFilter === y ? 600 : 400,
            }}
          >
            {y}
          </Link>
        ))}
      </div>

      {totalTagged === 0 ? (
        <div
          style={{
            background: 'var(--mm-surface)',
            border: '1px solid var(--mm-line)',
            borderRadius: 12,
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--mm-muted)',
            fontSize: 13,
          }}
        >
          Aguardando questões — importe lotes e classifique para ver a análise.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Pareto por módulo */}
            <div
              style={{
                background: 'var(--mm-surface)',
                border: '1px solid var(--mm-line)',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                }}
              >
                <span
                  className="font-[family-name:var(--font-syne)]"
                  style={{ fontSize: 14, fontWeight: 700 }}
                >
                  Regra de Pareto — por módulo
                </span>
                <span
                  style={{
                    background: 'var(--mm-gold-bg)',
                    color: 'var(--mm-gold)',
                    border: '1px solid var(--mm-gold-border)',
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: 20,
                  }}
                >
                  {totalTagged} tags
                </span>
              </div>

              {/* Barras verticais + curva acumulada */}
              <div style={{ position: 'relative', height: 100, marginBottom: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 6,
                    height: '100%',
                  }}
                >
                  {modulosData.map((m, i) => {
                    const pct = (m.count / maxCount) * 100
                    const totalPct =
                      totalTagged > 0 ? Math.round((m.count / totalTagged) * 100) : 0
                    const isVital = cumulativePoints[i] <= 80
                    return (
                      <div
                        key={m.label}
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 3,
                          height: '100%',
                          justifyContent: 'flex-end',
                        }}
                        title={`${m.label}: ${m.count} (${totalPct}%) — acum. ${Math.round(cumulativePoints[i])}%`}
                      >
                        <span style={{ fontSize: 9, color: 'var(--mm-muted)', lineHeight: 1 }}>
                          {totalPct}%
                        </span>
                        <div
                          style={{
                            width: '100%',
                            height: `${Math.max(pct, 4)}%`,
                            background: m.color,
                            borderRadius: '3px 3px 0 0',
                            opacity: isVital ? 0.9 : 0.45,
                            minHeight: 4,
                          }}
                        />
                      </div>
                    )
                  })}
                </div>

                {/* SVG: linha acumulada + marcador 80% */}
                {modulosData.length > 0 && (
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      overflow: 'visible',
                    }}
                  >
                    {/* Linha de 80% */}
                    <line
                      x1="0" y1="20" x2="100" y2="20"
                      stroke="#D4A843"
                      strokeWidth="0.6"
                      strokeDasharray="3,2"
                      opacity="0.5"
                    />
                    <text x="99" y="18" fontSize="5" fill="#D4A843" opacity="0.6" textAnchor="end">
                      80%
                    </text>
                    {/* Curva acumulada */}
                    <polyline
                      points={svgCurvePts}
                      fill="none"
                      stroke="#D4A843"
                      strokeWidth="1"
                      opacity="0.75"
                    />
                    {/* Pontos */}
                    {cumulativePoints.map((cp, i) => {
                      const x = ((i + 0.5) / modulosData.length) * 100
                      const y = 100 - cp
                      return (
                        <circle
                          key={i}
                          cx={x.toFixed(1)}
                          cy={y.toFixed(1)}
                          r="1.8"
                          fill="#D4A843"
                          opacity="0.85"
                        />
                      )
                    })}
                  </svg>
                )}
              </div>

              {/* Legenda */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {modulosData.map((m, i) => {
                  const pct =
                    totalTagged > 0 ? Math.round((m.count / totalTagged) * 100) : 0
                  const cumPct = Math.round(cumulativePoints[i])
                  const isVital = cumulativePoints[i] <= 80
                  return (
                    <div
                      key={m.label}
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: m.color,
                          flexShrink: 0,
                          opacity: isVital ? 1 : 0.5,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 11,
                          color: isVital ? 'var(--mm-text2)' : 'var(--mm-muted)',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.label}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--mm-muted)', flexShrink: 0 }}>
                        {m.count} ({pct}%)
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: isVital ? '#D4A843' : 'var(--mm-muted)',
                          flexShrink: 0,
                          width: 34,
                          textAlign: 'right',
                          opacity: 0.8,
                        }}
                      >
                        ↑{cumPct}%
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Insight box */}
              {paretoAlert && (
                <div
                  style={{
                    marginTop: 14,
                    background: 'var(--mm-gold-bg)',
                    border: '1px solid var(--mm-gold-border)',
                    borderRadius: 8,
                    padding: '10px 14px',
                  }}
                >
                  <p
                    className="font-[family-name:var(--font-syne)]"
                    style={{ fontSize: 11, fontWeight: 700, color: 'var(--mm-gold)', marginBottom: 4 }}
                  >
                    Insight Pareto
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--mm-text2)', lineHeight: 1.5 }}>
                    Os 3 principais módulos representam{' '}
                    <strong style={{ color: 'var(--mm-gold)' }}>
                      {Math.round((top3Count / totalTagged) * 100)}%
                    </strong>{' '}
                    das questões: {modulosData.slice(0, 3).map((m) => m.label).join(', ')}.
                  </p>
                </div>
              )}
            </div>

            {/* Evolução temporal */}
            <div
              style={{
                background: 'var(--mm-surface)',
                border: '1px solid var(--mm-line)',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                }}
              >
                <span
                  className="font-[family-name:var(--font-syne)]"
                  style={{ fontSize: 14, fontWeight: 700 }}
                >
                  Evolução temporal por módulo
                </span>
                <span
                  style={{
                    background: 'rgba(79,195,247,0.1)',
                    color: '#4FC3F7',
                    border: '1px solid rgba(79,195,247,0.25)',
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: 20,
                  }}
                >
                  Top 6
                </span>
              </div>

              {yearFilter ? (
                <p style={{ fontSize: 12, color: 'var(--mm-muted)', textAlign: 'center', padding: '20px 0' }}>
                  Remova o filtro de ano para ver a evolução temporal.
                </p>
              ) : topModulosByYear.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--mm-muted)', textAlign: 'center', padding: '20px 0' }}>
                  Aguardando questões para calcular evolução.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {topModulosByYear.map((m) => (
                    <div key={m.modulo}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 5,
                        }}
                      >
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: m.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--mm-text2)',
                            fontWeight: 600,
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.modulo}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--mm-muted)', flexShrink: 0 }}>
                          {m.total}
                        </span>
                      </div>
                      {/* Mini bar chart por ano */}
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
                        {yearsForChart.map((y) => {
                          const cnt = m.countByYear[y] ?? 0
                          const barH = cnt > 0
                            ? Math.max(Math.round((cnt / m.maxYearCount) * 28), 4)
                            : 0
                          return (
                            <div
                              key={y}
                              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                              title={`${y}: ${cnt} questões`}
                            >
                              <div style={{ height: 28, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: '100%' }}>
                                {cnt > 0 && (
                                  <div
                                    style={{
                                      width: '100%',
                                      height: barH,
                                      background: m.color,
                                      borderRadius: '2px 2px 0 0',
                                      opacity: 0.8,
                                    }}
                                  />
                                )}
                              </div>
                              <span style={{ fontSize: 8, color: 'var(--mm-muted)', marginTop: 2, lineHeight: 1 }}>
                                {String(y).slice(2)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top 20 temas */}
          <div
            style={{
              background: 'var(--mm-surface)',
              border: '1px solid var(--mm-line)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <span
                className="font-[family-name:var(--font-syne)]"
                style={{ fontSize: 14, fontWeight: 700 }}
              >
                Top 20 temas
              </span>
              <span
                style={{
                  background: 'var(--mm-gold-bg)',
                  color: 'var(--mm-gold)',
                  border: '1px solid var(--mm-gold-border)',
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 20,
                }}
              >
                Por incidência
              </span>
            </div>

            {top20Temas.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--mm-muted)', textAlign: 'center', padding: '20px 0' }}>
                Nenhum tema (topico_edital) classificado ainda.
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['#', 'TEMA', 'QUESTÕES', '% DO TOTAL', 'INCIDÊNCIA'].map((col) => (
                      <th
                        key={col}
                        style={{
                          textAlign: 'left',
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'var(--mm-muted)',
                          letterSpacing: '0.5px',
                          textTransform: 'uppercase',
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--mm-line2)',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {top20Temas.map((tema, idx) => {
                    const pct =
                      totalTagged > 0
                        ? Math.round((tema.count / totalTagged) * 100)
                        : 0
                    const incidencia =
                      pct >= 10 ? 'alta' : pct >= 5 ? 'média' : 'baixa'
                    const incColor =
                      incidencia === 'alta'
                        ? '#EF5350'
                        : incidencia === 'média'
                        ? '#FF9800'
                        : '#66BB6A'
                    return (
                      <tr
                        key={tema.label}
                        style={{ borderBottom: '1px solid var(--mm-line)' }}
                      >
                        <td
                          style={{
                            padding: '10px 12px',
                            fontSize: 12,
                            color: 'var(--mm-muted)',
                            width: 32,
                          }}
                        >
                          {idx + 1}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--mm-text2)' }}>
                          {tema.label}
                        </td>
                        <td
                          style={{
                            padding: '10px 12px',
                            fontSize: 12,
                            color: 'var(--mm-text)',
                            fontWeight: 700,
                            fontFamily: 'var(--font-syne)',
                          }}
                        >
                          {tema.count}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--mm-text2)' }}>
                          {pct}%
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{
                              background: `${incColor}15`,
                              color: incColor,
                              border: `1px solid ${incColor}40`,
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 20,
                              textTransform: 'capitalize',
                            }}
                          >
                            {incidencia}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
