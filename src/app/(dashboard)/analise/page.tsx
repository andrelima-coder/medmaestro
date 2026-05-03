import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Card, CardBody, CardHeader, CardTitle, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

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

const filterChipBase =
  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] no-underline transition-colors'
const filterChipIdle =
  'border-[var(--mm-border-default)] text-[var(--mm-text2)] hover:border-[var(--mm-border-hover)]'
const filterChipMuted =
  'border-[var(--mm-border-default)] text-[var(--mm-muted)] hover:border-[var(--mm-border-hover)]'
const filterChipActive =
  'border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)] text-[var(--mm-gold)]'

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

  const specialties = bancaFilter
    ? allSpecialties.filter((s) => boardSlugById.get(s.exam_board_id as string) === bancaFilter)
    : allSpecialties

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
      allExams.map((e) => e.booklet_color as string | null).filter((c): c is string => !!c)
    ),
  ].sort()

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

  let modTags = modTagsRes.data ?? []
  let temasTags = temasTagsRes.data ?? []
  if (allowedQuestionIds !== null) {
    const allow = allowedQuestionIds
    modTags = modTags.filter((t) => allow.has(t.question_id as string))
    temasTags = temasTags.filter((t) => allow.has(t.question_id as string))
  }

  const totalTagged = modTags.length

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

  const top3Count = modulosData.slice(0, 3).reduce((s, m) => s + m.count, 0)
  const paretoAlert = totalTagged > 0 && top3Count / totalTagged > 0.5

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
        <h1 className="font-[family-name:var(--font-syne)] text-xl font-bold text-foreground">
          Análise 80/20
        </h1>
        <p className="mt-1 text-[13px] text-[var(--mm-muted)]">
          Distribuição e incidência por módulo — Regra de Pareto
        </p>
      </div>

      {/* Card de filtros */}
      <Card>
        <CardBody>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <FilterColumn label="Banca">
              <Link
                href={buildUrl(params, { banca: '', especialidade: '' })}
                className={cn(filterChipBase, !bancaFilter ? filterChipActive : filterChipMuted)}
              >
                Todas
              </Link>
              {boards.map((b) => (
                <Link
                  key={b.id as string}
                  href={buildUrl(params, { banca: b.slug as string, especialidade: '' })}
                  className={cn(
                    filterChipBase,
                    bancaFilter === b.slug ? filterChipActive : filterChipIdle
                  )}
                >
                  {(b.short_name as string) ?? (b.name as string)}
                </Link>
              ))}
            </FilterColumn>

            <FilterColumn label="Especialidade">
              <Link
                href={buildUrl(params, { especialidade: '' })}
                className={cn(filterChipBase, !especialidadeFilter ? filterChipActive : filterChipMuted)}
              >
                Todas
              </Link>
              {specialties.length === 0 ? (
                <span className="px-2.5 py-1 text-[11px] italic text-[var(--mm-muted)]">—</span>
              ) : (
                specialties.map((s) => (
                  <Link
                    key={s.id as string}
                    href={buildUrl(params, { especialidade: s.slug as string })}
                    className={cn(
                      filterChipBase,
                      'truncate',
                      especialidadeFilter === s.slug ? filterChipActive : filterChipIdle
                    )}
                  >
                    {s.name as string}
                  </Link>
                ))
              )}
            </FilterColumn>

            <FilterColumn label="Ano">
              <Link
                href={buildUrl(params, { year: '' })}
                className={cn(filterChipBase, !yearFilter ? filterChipActive : filterChipMuted)}
              >
                Todos
              </Link>
              {yearsForFilter.map((y) => (
                <Link
                  key={y}
                  href={buildUrl(params, { year: String(y) })}
                  className={cn(filterChipBase, yearFilter === y ? filterChipActive : filterChipIdle)}
                >
                  {y}
                </Link>
              ))}
            </FilterColumn>

            <FilterColumn label="Cor da prova">
              <Link
                href={buildUrl(params, { cor: '' })}
                className={cn(filterChipBase, !corFilter ? filterChipActive : filterChipMuted)}
              >
                Todas
              </Link>
              {coresForFilter.map((c) => (
                <Link
                  key={c}
                  href={buildUrl(params, { cor: c })}
                  className={cn(filterChipBase, corFilter === c ? filterChipActive : filterChipIdle)}
                >
                  <span
                    aria-hidden
                    className="inline-block size-2 flex-shrink-0 rounded-full border border-white/15"
                    style={{ background: COR_DOT[c.toLowerCase()] ?? '#5A6880' }}
                  />
                  <span className="capitalize">{c}</span>
                </Link>
              ))}
            </FilterColumn>

            <FilterColumn label="Dificuldade">
              <Link
                href={buildUrl(params, { dificuldade: '' })}
                className={cn(filterChipBase, !dificuldadeFilter ? filterChipActive : filterChipMuted)}
              >
                Todas
              </Link>
              {dificuldades.map((d) => (
                <Link
                  key={d.id as string}
                  href={buildUrl(params, { dificuldade: d.label as string })}
                  className={cn(
                    filterChipBase,
                    dificuldadeFilter === d.label ? filterChipActive : filterChipIdle
                  )}
                >
                  {d.label as string}
                </Link>
              ))}
            </FilterColumn>
          </div>

          {hasAnyFilter && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--mm-border-default)] pt-4">
              <span className="text-[11px] text-[var(--mm-muted)]">Filtros ativos:</span>
              {activeFilters.map((f) => (
                <Link
                  key={f.removeKey}
                  href={buildUrl(params, { [f.removeKey]: '' })}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)] px-2.5 py-0.5 text-[11px] text-[var(--mm-gold)] no-underline transition-opacity hover:opacity-80"
                >
                  {f.label}
                  <span aria-hidden className="opacity-70">
                    ×
                  </span>
                </Link>
              ))}
              <Link
                href="/analise"
                className="ml-auto text-[11px] text-[var(--mm-muted)] no-underline hover:text-foreground"
              >
                Limpar tudo
              </Link>
            </div>
          )}
        </CardBody>
      </Card>

      {totalTagged === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-[13px] text-[var(--mm-muted)]">
            {hasAnyFilter
              ? 'Nenhuma questão encontrada com os filtros aplicados.'
              : 'Aguardando questões — importe lotes e classifique para ver a análise.'}
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Pareto por módulo */}
            <Card glow="purple" accent="purple">
              <CardHeader>
                <CardTitle>Regra de Pareto — por módulo</CardTitle>
                <Badge tone="gold">{totalTagged} tags</Badge>
              </CardHeader>
              <CardBody>
                {/* Barras verticais + curva acumulada */}
                <div className="relative mb-3 h-[100px]">
                  <div className="flex h-full items-end gap-1.5">
                    {modulosData.map((m, i) => {
                      const pct = (m.count / maxCount) * 100
                      const totalPct =
                        totalTagged > 0 ? Math.round((m.count / totalTagged) * 100) : 0
                      const isVital = cumulativePoints[i] <= 80
                      return (
                        <div
                          key={m.label}
                          className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                          title={`${m.label}: ${m.count} (${totalPct}%) — acum. ${Math.round(cumulativePoints[i])}%`}
                        >
                          <span className="text-[9px] leading-none text-[var(--mm-muted)]">
                            {totalPct}%
                          </span>
                          <div
                            className="w-full rounded-t-[3px]"
                            style={{
                              height: `${Math.max(pct, 4)}%`,
                              minHeight: 4,
                              background: m.color,
                              opacity: isVital ? 0.9 : 0.45,
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
                      className="pointer-events-none absolute inset-0 size-full overflow-visible"
                    >
                      <line
                        x1="0"
                        y1="20"
                        x2="100"
                        y2="20"
                        stroke="var(--mm-gold)"
                        strokeWidth="0.6"
                        strokeDasharray="3,2"
                        opacity="0.5"
                      />
                      <text
                        x="99"
                        y="18"
                        fontSize="5"
                        fill="var(--mm-gold)"
                        opacity="0.6"
                        textAnchor="end"
                      >
                        80%
                      </text>
                      <polyline
                        points={svgCurvePts}
                        fill="none"
                        stroke="var(--mm-gold)"
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
                            fill="var(--mm-gold)"
                            opacity="0.85"
                          />
                        )
                      })}
                    </svg>
                  )}
                </div>

                {/* Legenda */}
                <div className="flex flex-col gap-1.5">
                  {modulosData.map((m, i) => {
                    const pct = totalTagged > 0 ? Math.round((m.count / totalTagged) * 100) : 0
                    const cumPct = Math.round(cumulativePoints[i])
                    const isVital = cumulativePoints[i] <= 80
                    return (
                      <div key={m.label} className="flex items-center gap-2">
                        <div
                          className="size-2.5 flex-shrink-0 rounded-sm"
                          style={{ background: m.color, opacity: isVital ? 1 : 0.5 }}
                        />
                        <span
                          className={cn(
                            'flex-1 truncate text-[11px]',
                            isVital ? 'text-[var(--mm-text2)]' : 'text-[var(--mm-muted)]'
                          )}
                        >
                          {m.label}
                        </span>
                        <span className="flex-shrink-0 text-[11px] text-[var(--mm-muted)]">
                          {m.count} ({pct}%)
                        </span>
                        <span
                          className={cn(
                            'w-9 flex-shrink-0 text-right text-[10px] opacity-80',
                            isVital ? 'text-[var(--mm-gold)]' : 'text-[var(--mm-muted)]'
                          )}
                        >
                          ↑{cumPct}%
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Insight box */}
                {paretoAlert && (
                  <div className="mt-3.5 rounded-lg border border-[var(--mm-gold-border)] bg-[var(--mm-gold-bg)] px-3.5 py-2.5">
                    <p className="mb-1 font-[family-name:var(--font-syne)] text-[11px] font-bold text-[var(--mm-gold)]">
                      Insight Pareto
                    </p>
                    <p className="text-[11px] leading-[1.5] text-[var(--mm-text2)]">
                      Os 3 principais módulos representam{' '}
                      <strong className="text-[var(--mm-gold)]">
                        {Math.round((top3Count / totalTagged) * 100)}%
                      </strong>{' '}
                      das questões: {modulosData.slice(0, 3).map((m) => m.label).join(', ')}.
                    </p>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Evolução temporal */}
            <Card>
              <CardHeader>
                <CardTitle>Evolução temporal por módulo</CardTitle>
                <Badge tone="blue">Top 6</Badge>
              </CardHeader>
              <CardBody>
                {yearFilter ? (
                  <p className="py-6 text-center text-xs text-[var(--mm-muted)]">
                    Remova o filtro de ano para ver a evolução temporal.
                  </p>
                ) : topModulosByYear.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[var(--mm-muted)]">
                    Aguardando questões para calcular evolução.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {topModulosByYear.map((m) => (
                      <div key={m.modulo}>
                        <div className="mb-1 flex items-center gap-2">
                          <div
                            className="size-2 flex-shrink-0 rounded-sm"
                            style={{ background: m.color }}
                          />
                          <span className="flex-1 truncate text-[11px] font-semibold text-[var(--mm-text2)]">
                            {m.modulo}
                          </span>
                          <span className="flex-shrink-0 text-[10px] text-[var(--mm-muted)]">
                            {m.total}
                          </span>
                        </div>
                        <div className="flex h-9 items-end gap-1">
                          {yearsForChart.map((y) => {
                            const cnt = m.countByYear[y] ?? 0
                            const barH =
                              cnt > 0 ? Math.max(Math.round((cnt / m.maxYearCount) * 28), 4) : 0
                            return (
                              <div
                                key={y}
                                className="flex flex-1 flex-col items-center"
                                title={`${y}: ${cnt} questões`}
                              >
                                <div className="flex h-7 w-full flex-col justify-end">
                                  {cnt > 0 && (
                                    <div
                                      className="w-full rounded-t-[2px]"
                                      style={{
                                        height: barH,
                                        background: m.color,
                                        opacity: 0.8,
                                      }}
                                    />
                                  )}
                                </div>
                                <span className="mt-0.5 text-[8px] leading-none text-[var(--mm-muted)]">
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
              </CardBody>
            </Card>
          </div>

          {/* Top 20 temas */}
          <Card>
            <CardHeader>
              <CardTitle>Top 20 temas</CardTitle>
              <Badge tone="gold">Por incidência</Badge>
            </CardHeader>
            <CardBody className="p-0">
              {top20Temas.length === 0 ? (
                <p className="py-6 text-center text-xs text-[var(--mm-muted)]">
                  Nenhum tema (topico_edital) classificado ainda.
                </p>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['#', 'TEMA', 'QUESTÕES', '% DO TOTAL', 'INCIDÊNCIA'].map((col) => (
                        <th
                          key={col}
                          scope="col"
                          className="border-b border-[var(--mm-line2)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--mm-muted)]"
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
                      const incTone: 'red' | 'orange' | 'green' =
                        incidencia === 'alta'
                          ? 'red'
                          : incidencia === 'média'
                            ? 'orange'
                            : 'green'
                      return (
                        <tr
                          key={tema.label}
                          className="border-b border-[var(--mm-border-default)]"
                        >
                          <td className="w-8 px-3 py-2.5 text-xs text-[var(--mm-muted)]">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-[var(--mm-text2)]">
                            {tema.label}
                          </td>
                          <td className="px-3 py-2.5 font-[family-name:var(--font-syne)] text-xs font-bold text-foreground">
                            {tema.count}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-[var(--mm-text2)]">
                            {pct}%
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge tone={incTone} className="capitalize">
                              {incidencia}
                            </Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}

function FilterColumn({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--mm-muted)]">
        {label}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}
