import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { Card, CardBody, Badge, TagChip } from '@/components/ui'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Questões — MedMaestro' }

const PAGE_SIZE = 20

type SearchParams = {
  modulo?: string
  tema?: string
  dificuldade?: string
  year?: string
  page?: string
  q?: string
}

type BadgeTone = 'green' | 'gold' | 'red' | 'blue' | 'muted' | 'orange' | 'purple'

const STATUS_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
  extracted: { label: 'Extraída', tone: 'blue' },
  reviewing: { label: 'Em revisão', tone: 'gold' },
  approved: { label: 'Aprovada', tone: 'green' },
  rejected: { label: 'Rejeitada', tone: 'red' },
  published: { label: 'Publicada', tone: 'green' },
  flagged: { label: 'Sinalizada', tone: 'red' },
  commented: { label: 'Comentada', tone: 'purple' },
  draft: { label: 'Rascunho', tone: 'muted' },
}

function buildUrl(params: SearchParams, overrides: Partial<SearchParams>): string {
  const p = new URLSearchParams()
  const merged = { ...params, ...overrides }
  if (merged.q) p.set('q', merged.q)
  if (merged.modulo) p.set('modulo', merged.modulo)
  if (merged.tema) p.set('tema', merged.tema)
  if (merged.dificuldade) p.set('dificuldade', merged.dificuldade)
  if (merged.year) p.set('year', merged.year)
  if (merged.page) p.set('page', merged.page)
  return `/questoes${p.toString() ? '?' + p.toString() : ''}`
}

const filterChipBase =
  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] no-underline transition-colors'
const filterChipIdle =
  'border-[var(--mm-border-default)] text-[var(--mm-text2)] hover:border-[var(--mm-border-hover)]'
const filterChipMuted =
  'border-[var(--mm-border-default)] text-[var(--mm-muted)] hover:border-[var(--mm-border-hover)]'
const filterChipActive =
  'border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)] text-[var(--mm-gold)]'

export default async function QuestoesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const moduloFilter = params.modulo ?? ''
  const temaFilter = params.tema ?? ''
  const dificuldadeFilter = params.dificuldade ?? ''
  const yearFilter = params.year ? parseInt(params.year) : null
  const qFilter = params.q?.trim() ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1'))
  const offset = (page - 1) * PAGE_SIZE

  const service = createServiceClient()

  const [modulosRes, temasRes, dificuldadesRes, yearsRes] = await Promise.all([
    service
      .from('tags')
      .select('id, label, color')
      .eq('dimension', 'modulo')
      .order('display_order'),
    service
      .from('tags')
      .select('id, label')
      .eq('dimension', 'topico_edital')
      .order('label'),
    service
      .from('tags')
      .select('id, label')
      .eq('dimension', 'dificuldade')
      .order('display_order'),
    service.from('exams').select('year').order('year', { ascending: false }),
  ])

  const modulos = modulosRes.data ?? []
  const temas = temasRes.data ?? []
  const dificuldades = dificuldadesRes.data ?? []
  const years = [...new Set((yearsRes.data ?? []).map((e) => e.year as number))]

  let questionIdFilter: string[] | null = null

  const tagFilters: { dimension: string; label: string }[] = []
  if (moduloFilter) tagFilters.push({ dimension: 'modulo', label: moduloFilter })
  if (temaFilter) tagFilters.push({ dimension: 'topico_edital', label: temaFilter })
  if (dificuldadeFilter)
    tagFilters.push({ dimension: 'dificuldade', label: dificuldadeFilter })

  if (tagFilters.length > 0) {
    const sets: Set<string>[] = []
    for (const tf of tagFilters) {
      const { data: tagRow } = await service
        .from('tags')
        .select('id')
        .eq('dimension', tf.dimension)
        .eq('label', tf.label)
        .limit(1)
        .maybeSingle()
      if (tagRow?.id) {
        const { data: qtRows } = await service
          .from('question_tags')
          .select('question_id')
          .eq('tag_id', tagRow.id)
        sets.push(new Set((qtRows ?? []).map((r) => r.question_id as string)))
      } else {
        sets.push(new Set())
      }
    }
    let intersection = sets[0] ?? new Set<string>()
    for (let i = 1; i < sets.length; i++) {
      intersection = new Set([...intersection].filter((id) => sets[i].has(id)))
    }
    questionIdFilter = [...intersection]
  }

  let query = service
    .from('questions')
    .select(
      `id, question_number, stem, status, has_images, extraction_confidence, correct_answer,
       exams!inner(id, year, booklet_color, exam_boards(short_name), specialties(name)),
       question_tags!left(tags!inner(label, dimension, color))`,
      { count: 'exact' }
    )
    .order('question_number', { ascending: true })

  if (yearFilter) query = query.eq('exams.year', yearFilter)
  if (qFilter) query = query.ilike('stem', `%${qFilter}%`)

  if (questionIdFilter !== null) {
    if (questionIdFilter.length === 0) {
      return <EmptyState total={0} />
    }
    query = query.in('id', questionIdFilter)
  }

  const { data: questions, count } = await query.range(offset, offset + PAGE_SIZE - 1)

  const total = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const activeFilters: { label: string; removeKey: string }[] = []
  if (qFilter) activeFilters.push({ label: `"${qFilter}"`, removeKey: 'q' })
  if (moduloFilter)
    activeFilters.push({ label: `Módulo: ${moduloFilter}`, removeKey: 'modulo' })
  if (temaFilter) activeFilters.push({ label: `Tema: ${temaFilter}`, removeKey: 'tema' })
  if (dificuldadeFilter)
    activeFilters.push({ label: `Dificuldade: ${dificuldadeFilter}`, removeKey: 'dificuldade' })
  if (yearFilter) activeFilters.push({ label: `Ano: ${yearFilter}`, removeKey: 'year' })

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-syne)] text-xl font-bold text-foreground">
          Banco de Questões
        </h1>
        <p className="mt-1 text-[13px] text-[var(--mm-muted)]">
          {total.toLocaleString('pt-BR')} questões no banco
          {qFilter || moduloFilter || temaFilter || dificuldadeFilter || yearFilter
            ? ' · resultados filtrados'
            : ''}
        </p>
      </div>

      {/* Card de filtros */}
      <Card>
        <CardBody>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {/* Módulo */}
            <FilterColumn label="Módulo">
              <Link
                href={buildUrl(params, { modulo: '', page: '1' })}
                className={cn(filterChipBase, !moduloFilter ? filterChipActive : filterChipMuted)}
              >
                Todos
              </Link>
              {modulos.slice(0, 5).map((m) => {
                const active = moduloFilter === m.label
                return (
                  <Link
                    key={m.id as string}
                    href={buildUrl(params, { modulo: m.label as string, page: '1' })}
                    className={cn(filterChipBase, active ? filterChipActive : filterChipIdle)}
                  >
                    <span
                      className="inline-block size-2 rounded-sm flex-shrink-0"
                      style={{ background: (m.color as string | null) ?? '#5A6880' }}
                    />
                    <span className="truncate">{m.label as string}</span>
                  </Link>
                )
              })}
            </FilterColumn>

            {/* Tema */}
            <FilterColumn label="Tema">
              <Link
                href={buildUrl(params, { tema: '', page: '1' })}
                className={cn(filterChipBase, !temaFilter ? filterChipActive : filterChipMuted)}
              >
                Todos
              </Link>
              {temas.slice(0, 5).map((t) => (
                <Link
                  key={t.id as string}
                  href={buildUrl(params, { tema: t.label as string, page: '1' })}
                  className={cn(
                    filterChipBase,
                    'truncate',
                    temaFilter === t.label ? filterChipActive : filterChipIdle
                  )}
                >
                  {t.label as string}
                </Link>
              ))}
            </FilterColumn>

            {/* Dificuldade */}
            <FilterColumn label="Dificuldade">
              <Link
                href={buildUrl(params, { dificuldade: '', page: '1' })}
                className={cn(filterChipBase, !dificuldadeFilter ? filterChipActive : filterChipMuted)}
              >
                Todas
              </Link>
              {dificuldades.map((d) => (
                <Link
                  key={d.id as string}
                  href={buildUrl(params, { dificuldade: d.label as string, page: '1' })}
                  className={cn(
                    filterChipBase,
                    dificuldadeFilter === d.label ? filterChipActive : filterChipIdle
                  )}
                >
                  {d.label as string}
                </Link>
              ))}
            </FilterColumn>

            {/* Ano */}
            <FilterColumn label="Ano">
              <Link
                href={buildUrl(params, { year: '', page: '1' })}
                className={cn(filterChipBase, !yearFilter ? filterChipActive : filterChipMuted)}
              >
                Todos
              </Link>
              {years.map((y) => (
                <Link
                  key={y}
                  href={buildUrl(params, { year: String(y), page: '1' })}
                  className={cn(
                    filterChipBase,
                    yearFilter === y ? filterChipActive : filterChipIdle
                  )}
                >
                  {y}
                </Link>
              ))}
            </FilterColumn>
          </div>
        </CardBody>
      </Card>

      {/* Filtros ativos + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-[family-name:var(--font-syne)] text-sm font-bold text-foreground">
            {total.toLocaleString('pt-BR')} questões encontradas
          </span>
          {activeFilters.map((f) => (
            <Link
              key={f.removeKey}
              href={buildUrl(params, { [f.removeKey]: '', page: '1' })}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)] px-2.5 py-0.5 text-[11px] text-[var(--mm-gold)] no-underline transition-opacity hover:opacity-80"
            >
              {f.label}
              <span aria-hidden className="opacity-70">
                ×
              </span>
            </Link>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            disabled
            className="cursor-not-allowed rounded-lg border border-[var(--mm-border-default)] bg-transparent px-4 py-2 text-xs font-semibold text-[var(--mm-muted)]"
          >
            Exportar seleção →
          </button>
          <button
            disabled
            className="cursor-not-allowed rounded-lg px-4 py-2 text-xs font-bold text-[#0A0A0A] opacity-60"
            style={{
              background:
                'linear-gradient(135deg, var(--mm-gold) 0%, var(--mm-orange) 100%)',
              boxShadow:
                '0 4px 20px rgba(201,120,30,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            Gerar simulado
          </button>
        </div>
      </div>

      {/* Cards de questão */}
      {total === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-[13px] text-[var(--mm-muted)]">
            Nenhuma questão encontrada com os filtros aplicados.
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {(questions ?? []).map((q) => {
            const exam = q.exams as unknown as {
              id: string
              year: number
              booklet_color: string | null
              exam_boards: { short_name: string } | null
              specialties: { name: string } | null
            } | null

            const tags =
              (q.question_tags as unknown as
                | { tags: { label: string; dimension: string; color: string | null } }[]
                | null) ?? []

            const dificuldadeTag = tags.find((qt) => qt.tags?.dimension === 'dificuldade')?.tags
            const tipoTag = tags.find((qt) => qt.tags?.dimension === 'tipo_questao')?.tags
            const allVisibleTags = tags.filter((qt) => qt.tags).slice(0, 5)

            const statusKey = (q.status as string) ?? 'extracted'
            const sc = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.extracted
            const stemFull = (q.stem as string | null) ?? ''
            const stem = stemFull.slice(0, 120)

            return (
              <Card key={q.id as string}>
                <CardBody className="p-4">
                  {/* Topo */}
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-[family-name:var(--font-syne)] text-[11px] font-bold text-[var(--mm-gold)]">
                      QUESTÃO {q.question_number as number}
                      {exam ? ` · ${exam.exam_boards?.short_name ?? 'TEMI'} ${exam.year}` : ''}
                    </span>
                    <Badge tone={sc.tone}>{sc.label}</Badge>
                  </div>

                  {/* Tags chips */}
                  {allVisibleTags.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {allVisibleTags.map((qt, i) => (
                        <TagChip
                          key={i}
                          style={
                            qt.tags.color
                              ? { background: `${qt.tags.color}15` }
                              : undefined
                          }
                        >
                          {qt.tags.label}
                        </TagChip>
                      ))}
                    </div>
                  )}

                  {/* Enunciado */}
                  <p className="mb-2.5 text-[13px] leading-[1.6] text-[var(--mm-text2)]">
                    {stem || '(sem enunciado)'}
                    {stemFull.length > 120 ? '…' : ''}
                  </p>

                  {/* Rodapé */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-3 text-[11px] text-[var(--mm-muted)]">
                      {q.correct_answer && (
                        <span>
                          Gabarito:{' '}
                          <strong className="text-[var(--mm-green)]">
                            {q.correct_answer as string}
                          </strong>
                        </span>
                      )}
                      {dificuldadeTag && (
                        <span>
                          Dif.:{' '}
                          <span className="text-[var(--mm-text2)]">{dificuldadeTag.label}</span>
                        </span>
                      )}
                      {tipoTag && (
                        <span>
                          Tipo:{' '}
                          <span className="text-[var(--mm-text2)]">{tipoTag.label}</span>
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/questoes/${q.id}`}
                      className="text-[11px] font-semibold text-[var(--mm-gold)] no-underline hover:underline"
                    >
                      Ver questão →
                    </Link>
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--mm-muted)]">
            Página {page} de {totalPages} · {total} questões
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildUrl(params, { page: String(page - 1) })}
                className="rounded-lg border border-[var(--mm-border-default)] px-3.5 py-1.5 text-xs font-semibold text-[var(--mm-text2)] no-underline transition-colors hover:border-[var(--mm-border-hover)] hover:text-foreground"
              >
                ← Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildUrl(params, { page: String(page + 1) })}
                className="rounded-lg border border-[var(--mm-border-default)] px-3.5 py-1.5 text-xs font-semibold text-[var(--mm-text2)] no-underline transition-colors hover:border-[var(--mm-border-hover)] hover:text-foreground"
              >
                Próxima →
              </Link>
            )}
          </div>
        </div>
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

function EmptyState({ total }: { total: number }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-syne)] text-xl font-bold text-foreground">
          Banco de Questões
        </h1>
        <p className="mt-1 text-[13px] text-[var(--mm-muted)]">
          {total} questões encontradas
        </p>
      </div>
      <Card>
        <CardBody className="py-10 text-center text-[13px] text-[var(--mm-muted)]">
          Nenhuma questão encontrada com os filtros aplicados.{' '}
          <Link
            href="/questoes"
            className="text-[var(--mm-gold)] no-underline hover:underline"
          >
            Limpar filtros →
          </Link>
        </CardBody>
      </Card>
    </div>
  )
}
