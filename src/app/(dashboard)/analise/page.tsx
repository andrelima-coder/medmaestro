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

const COR_DOT: Record<string, string> = {
  azul: '#42A5F5',
  vermelho: '#EF5350',
  verde: '#66BB6A',
  amarelo: '#FFD54F',
  rosa: '#EC407A',
  roxo: '#AB47BC',
  laranja: '#FF7043',
  branco: '#E0E0E0',
}

type SearchParams = {
  year?: string
  banca?: string
  especialidade?: string
  cor?: string
  dificuldade?: string
}

function buildUrl(params: SearchParams, overrides: Partial<SearchParams>): string {
  const merged = { ...params, ...overrides }
  const p = new URLSearchParams()
  if (merged.banca) p.set('banca', merged.banca)
  if (merged.especialidade) p.set('especialidade', merged.especialidade)
  if (merged.year) p.set('year', merged.year)
  if (merged.cor) p.set('cor', merged.cor)
  if (merged.dificuldade) p.set('dificuldade', merged.dificuldade)
  return `/analise${p.toString() ? '?' + p.toString() : ''}`
}

const FILTER_LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--mm-muted)',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: 6,
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 10px',
    borderRadius: 6,
    fontSize: 11,
    textDecoration: 'none',
    border: active ? '1px solid var(--mm-gold-border)' : '1px solid var(--mm-line)',
    background: active ? 'var(--mm-gold-bg)' : 'transparent',
    color: active ? 'var(--mm-gold)' : 'var(--mm-text2)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }
}

export default async function AnalisePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const yearFilter = params.year ? parseInt(params.year) : null
  const bancaFilter = params.banca?.trim() || null
  const especialidadeFilter = params.especialidade?.trim() || null
  const corFilter = params.cor?.trim() || null
  const dificuldadeFilter = params.dificuldade?.trim() || null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if ((ROLE_RANK[profile?.role ?? ''] ?? -1) < ROLE_RANK['admin']) redirect('/dashboard')

  // Carrega opções de filtros + dados base em paralelo
  const [
    boardsRes,
    specialtiesRes,
    examsRes,
    dificuldadesRes,
    modTagsRes,
    temasTagsRes,
  ] = await Promise.all([
    service.from('exam_boards').select('id, slug, short_name, name').order('short_name'),
    service.from('specialties').select('id, slug, name, exam_board_id').order('name'),
    service
      .from('exams')
      .select('id, year, booklet_color, board_id, specialty_id')
      .order('year', { ascending: false }),
    service.from('tags').select('id, label').eq('dimension', 'dificuldade').order('display_order'),
    service
      .from('question_tags')
      .select('question_id, tags!inner(label, color, dimension)')
      .eq('tags.dimension', 'modulo'),
    service
      .from('question_tags')
      .select('question_id, tags!inner(label, dimension)')
      .eq('tags.dimension', 'topico_edital'),
  ])

  const boards = boardsRes.data ?? []
  const allSpecialties = specialtiesRes.data ?? []
  const allExams = examsRes.data ?? []
  const dificuldades = dificuldadesRes.data ?? []

  const boardSlugById = new Map(boards.map((b) => [b.id as string, b.slug as string]))
  const specialtySlugById = new Map(allSpecialties.map((s) => [s.id as string, s.slug as string]))

  // Especialidades filtradas pela banca selecionada
  const specialties = bancaFilter
    ? allSpecialties.filter((s) => boardSlugById.get(s.exam_board_id as string) === bancaFilter)
    : allSpecialties

  // Filtra exames por banca / especialidade / ano / cor
  const filteredExams = allExams.filter((e) => {
    if (bancaFilter && boardSlugById.get(e.board_id as string) !== bancaFilter) return false
    if (
      especialidadeFilter &&
      specialtySlugById.get(e.specialty_id as string) !== especialidadeFilter
    )
      return false
    if (yearFilter && (e.year as number) !== yearFilter) return false
    if (corFilter && (e.booklet_color as string | null) !== corFilter) return false
    return true
  })

  const filteredExamIds = new Set(filteredExams.map((e) => e.id as string))
  const examYearMap: Record<string, number> = {}
  for (const e of filteredExams) examYearMap[e.id as string] = e.year as number

  // Anos disponíveis (sem filtro de ano aplicado, mas respeitando demais filtros para UX)
  const yearsForFilter = [
    ...new Set(
      allExams
        .filter((e) => {
          if (bancaFilter && boardSlugById.get(e.board_id as string) !== bancaFilter) return false
          if (
            especialidadeFilter &&
            specialtySlugById.get(e.specialty_id as string) !== especialidadeFilter
          )
            return false
          if (corFilter && (e.booklet_color as string | null) !== corFilter) return false
          return true
        })
        .map((e) => e.year as number)
    ),
  ].sort((a, b) => b - a)

  const coresForFilter = [
    ...new Set(
      allExams
        .map((e) => e.booklet_color as string | null)
        .filter((c): c is string => !!c)
    ),
  ].sort()

  // Conjunto de question_ids permitidas pelos filtros de exame
  let allowedQuestionIds: Set<string> | null = null
  const hasExamFilter = !!(bancaFilter || especialidadeFilter || yearFilter || corFilter)
  if (hasExamFilter) {
    if (filteredExamIds.size === 0) {
      allowedQuestionIds = new Set()
    } else {
      const { data: qRows } = await service
        .from('questions')
        .select('id')
        .in('exam_id', [...filteredExamIds])
      allowedQuestionIds = new Set((qRows ?? []).map((q) => q.id as string))
    }
  }

  // Filtro de dificuldade → interseca com question_ids
  if (dificuldadeFilter) {
    const { data: tagRow } = await service
      .from('tags')
      .select('id')
      .eq('dimension', 'dificuldade')
      .eq('label', dificuldadeFilter)
      .limit(1)
      .maybeSingle()
    if (!tagRow?.id) {
      allowedQuestionIds = new Set()
    } else {
      const { data: qtRows } = await service
        .from('question_tags')
        .select('question_id')
        .eq('tag_id', tagRow.id)
      const dSet = new Set((qtRows ?? []).map((r) => r.question_id as string))
      allowedQuestionIds = allowedQuestionIds
        ? new Set([...allowedQuestionIds].filter((id) => dSet.has(id)))
        : dSet
    }
  }

  // Aplica o filtro de questão sobre as tags
  let modTags = modTagsRes.data ?? []
  let temasTags = temasTagsRes.data ?? []
  if (allowedQuestionIds !== null) {
    const allow = allowedQuestionIds
    modTags = modTags.filter((t) => allow.has(t.question_id as string))
    temasTags = temasTags.filter((t) => allow.has(t.question_id as string))
  }

  const totalTagged = modTags.length

  // Agrupa por módulo
  const moduloCount: Record<string, { color: string; count: number }> = {}
  for (const row of modTags) {
    const tag = row.tags as unknown as { label: string; color: string | null } | null
    if (!tag) continue
    const key = tag.label
    const color = tag.color ?? MODULO_COLORS[key] ?? '#5A6880'
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
  const temaCount: Record<string, { count: number }> = {}
  for (const row of temasTags) {
    const tag = row.tags as unknown as { label: string; dimension: string } | null
    if (!tag) continue
    if (!temaCount[tag.label]) temaCount[tag.label] = { count: 0 }
    temaCount[tag.label].count++
  }

  const top20Temas = Object.entries(temaCount)
    .map(([label, { count }]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  // Evolução temporal: módulos por ano (se não há filtro de ano)
  type ModuloYearRow = {
    modulo: string
    color: string
    countByYear: Record<number, number>
    total: number
  }
  const moduloYearData: Record<string, ModuloYearRow> = {}

  const allYearsForChart = [...new Set(filteredExams.map((e) => e.year as number))].sort(
    (a, b) => b - a
  )

  if (!yearFilter && allYearsForChart.length > 0) {
    const { data: qExamRows } = await service.from('questions').select('id, exam_id')
    const qExamMap: Record<string, string> = {}
    for (const q of qExamRows ?? []) qExamMap[q.id as string] = q.exam_id as string

    for (const row of modTags) {
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

  const yearsForChart = allYearsForChart.slice(0, 6)
  const topModulosByYear = Object.values(moduloYearData)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
    .map((m) => ({
      ...m,
      maxYearCount: Math.max(...yearsForChart.map((y) => m.countByYear[y] ?? 0), 1),
    }))

  // Chips de filtros ativos
  const activeFilters: { label: string; removeKey: keyof SearchParams }[] = []
  if (bancaFilter) {
    const b = boards.find((x) => x.slug === bancaFilter)
    activeFilters.push({
      label: `Banca: ${b ? (b.short_name as string) ?? (b.name as string) : bancaFilter}`,
      removeKey: 'banca',
    })
  }
  if (especialidadeFilter) {
    const s = allSpecialties.find((x) => x.slug === especialidadeFilter)
    activeFilters.push({
      label: `Especialidade: ${s ? (s.name as string) : especialidadeFilter}`,
      removeKey: 'especialidade',
    })
  }
  if (yearFilter) activeFilters.push({ label: `Ano: ${yearFilter}`, removeKey: 'year' })
  if (corFilter)
    activeFilters.push({
      label: `Cor: ${corFilter[0].toUpperCase() + corFilter.slice(1)}`,
      removeKey: 'cor',
    })
  if (dificuldadeFilter)
    activeFilters.push({ label: `Dificuldade: ${dificuldadeFilter}`, removeKey: 'dificuldade' })

  const hasAnyFilter = activeFilters.length > 0

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

      {/* Card de filtros */}
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
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 12,
          }}
        >
          {/* Banca */}
          <div>
            <label style={FILTER_LABEL_STYLE}>Banca</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Link
                href={buildUrl(params, { banca: '', especialidade: '' })}
                style={chipStyle(!bancaFilter)}
              >
                Todas
              </Link>
              {boards.map((b) => (
                <Link
                  key={b.id as string}
                  href={buildUrl(params, { banca: b.slug as string, especialidade: '' })}
                  style={chipStyle(bancaFilter === b.slug)}
                >
                  {(b.short_name as string) ?? (b.name as string)}
                </Link>
              ))}
            </div>
          </div>

          {/* Especialidade */}
          <div>
            <label style={FILTER_LABEL_STYLE}>Especialidade</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Link
                href={buildUrl(params, { especialidade: '' })}
                style={chipStyle(!especialidadeFilter)}
              >
                Todas
              </Link>
              {specialties.length === 0 ? (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--mm-muted)',
                    padding: '5px 10px',
                    fontStyle: 'italic',
                  }}
                >
                  —
                </span>
              ) : (
                specialties.map((s) => (
                  <Link
                    key={s.id as string}
                    href={buildUrl(params, { especialidade: s.slug as string })}
                    style={{
                      ...chipStyle(especialidadeFilter === s.slug),
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.name as string}
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Ano */}
          <div>
            <label style={FILTER_LABEL_STYLE}>Ano</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Link href={buildUrl(params, { year: '' })} style={chipStyle(!yearFilter)}>
                Todos
              </Link>
              {yearsForFilter.map((y) => (
                <Link
                  key={y}
                  href={buildUrl(params, { year: String(y) })}
                  style={chipStyle(yearFilter === y)}
                >
                  {y}
                </Link>
              ))}
            </div>
          </div>

          {/* Cor da prova */}
          <div>
            <label style={FILTER_LABEL_STYLE}>Cor da prova</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Link href={buildUrl(params, { cor: '' })} style={chipStyle(!corFilter)}>
                Todas
              </Link>
              {coresForFilter.map((c) => (
                <Link
                  key={c}
                  href={buildUrl(params, { cor: c })}
                  style={chipStyle(corFilter === c)}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: COR_DOT[c.toLowerCase()] ?? '#5A6880',
                      flexShrink: 0,
                      border: '1px solid rgba(255,255,255,0.15)',
                    }}
                  />
                  <span style={{ textTransform: 'capitalize' }}>{c}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Dificuldade */}
          <div>
            <label style={FILTER_LABEL_STYLE}>Dificuldade</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Link
                href={buildUrl(params, { dificuldade: '' })}
                style={chipStyle(!dificuldadeFilter)}
              >
                Todas
              </Link>
              {dificuldades.map((d) => (
                <Link
                  key={d.id as string}
                  href={buildUrl(params, { dificuldade: d.label as string })}
                  style={chipStyle(dificuldadeFilter === d.label)}
                >
                  {d.label as string}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Chips ativos + limpar */}
        {hasAnyFilter && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 14,
              paddingTop: 14,
              borderTop: '1px solid var(--mm-line)',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--mm-muted)', marginRight: 4 }}>
              Filtros ativos:
            </span>
            {activeFilters.map((f) => (
              <Link
                key={f.removeKey}
                href={buildUrl(params, { [f.removeKey]: '' })}
                style={{
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  textDecoration: 'none',
                  border: '1px solid var(--mm-gold-border)',
                  background: 'var(--mm-gold-bg)',
                  color: 'var(--mm-gold)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {f.label}
                <span style={{ opacity: 0.7 }}>×</span>
              </Link>
            ))}
            <Link
              href="/analise"
              style={{
                marginLeft: 'auto',
                fontSize: 11,
                color: 'var(--mm-muted)',
                textDecoration: 'none',
              }}
            >
              Limpar tudo
            </Link>
          </div>
        )}
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
          {hasAnyFilter
            ? 'Nenhuma questão encontrada com os filtros aplicados.'
            : 'Aguardando questões — importe lotes e classifique para ver a análise.'}
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
                    <line
                      x1="0"
                      y1="20"
                      x2="100"
                      y2="20"
                      stroke="#D4A843"
                      strokeWidth="0.6"
                      strokeDasharray="3,2"
                      opacity="0.5"
                    />
                    <text x="99" y="18" fontSize="5" fill="#D4A843" opacity="0.6" textAnchor="end">
                      80%
                    </text>
                    <polyline
                      points={svgCurvePts}
                      fill="none"
                      stroke="#D4A843"
                      strokeWidth="1"
                      opacity="0.75"
                    />
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
                  const pct = totalTagged > 0 ? Math.round((m.count / totalTagged) * 100) : 0
                  const cumPct = Math.round(cumulativePoints[i])
                  const isVital = cumulativePoints[i] <= 80
                  return (
                    <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--mm-gold)',
                      marginBottom: 4,
                    }}
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
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--mm-muted)',
                    textAlign: 'center',
                    padding: '20px 0',
                  }}
                >
                  Remova o filtro de ano para ver a evolução temporal.
                </p>
              ) : topModulosByYear.length === 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--mm-muted)',
                    textAlign: 'center',
                    padding: '20px 0',
                  }}
                >
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
                        <span
                          style={{
                            fontSize: 10,
                            color: 'var(--mm-muted)',
                            flexShrink: 0,
                          }}
                        >
                          {m.total}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
                        {yearsForChart.map((y) => {
                          const cnt = m.countByYear[y] ?? 0
                          const barH =
                            cnt > 0 ? Math.max(Math.round((cnt / m.maxYearCount) * 28), 4) : 0
                          return (
                            <div
                              key={y}
                              style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                              }}
                              title={`${y}: ${cnt} questões`}
                            >
                              <div
                                style={{
                                  height: 28,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'flex-end',
                                  width: '100%',
                                }}
                              >
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
                              <span
                                style={{
                                  fontSize: 8,
                                  color: 'var(--mm-muted)',
                                  marginTop: 2,
                                  lineHeight: 1,
                                }}
                              >
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
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--mm-muted)',
                  textAlign: 'center',
                  padding: '20px 0',
                }}
              >
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
                      totalTagged > 0 ? Math.round((tema.count / totalTagged) * 100) : 0
                    const incidencia = pct >= 10 ? 'alta' : pct >= 5 ? 'média' : 'baixa'
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
