import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'

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

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; border: string }
> = {
  pending_extraction: {
    label: 'Aguardando',
    bg: 'rgba(79,195,247,0.1)',
    color: '#4FC3F7',
    border: 'rgba(79,195,247,0.25)',
  },
  pending_review: {
    label: 'Revisão pendente',
    bg: 'rgba(255,152,0,0.1)',
    color: '#FF9800',
    border: 'rgba(255,152,0,0.25)',
  },
  in_review: {
    label: 'Em revisão',
    bg: 'var(--mm-gold-bg)',
    color: 'var(--mm-gold)',
    border: 'var(--mm-gold-border)',
  },
  approved: {
    label: 'Aprovada',
    bg: 'rgba(102,187,106,0.1)',
    color: '#66BB6A',
    border: 'rgba(102,187,106,0.25)',
  },
  rejected: {
    label: 'Rejeitada',
    bg: 'rgba(239,83,80,0.1)',
    color: '#EF5350',
    border: 'rgba(239,83,80,0.25)',
  },
  published: {
    label: 'Publicada',
    bg: 'rgba(102,187,106,0.15)',
    color: '#66BB6A',
    border: 'rgba(102,187,106,0.3)',
  },
  needs_attention: {
    label: 'Atenção',
    bg: 'rgba(239,83,80,0.1)',
    color: '#EF5350',
    border: 'rgba(239,83,80,0.25)',
  },
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

  // Carrega opções de filtro em paralelo
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
    service
      .from('exams')
      .select('year')
      .order('year', { ascending: false }),
  ])

  const modulos = modulosRes.data ?? []
  const temas = temasRes.data ?? []
  const dificuldades = dificuldadesRes.data ?? []
  const years = [...new Set((yearsRes.data ?? []).map((e) => e.year as number))]

  // Filtra por tags se necessário (busca IDs de questões)
  let questionIdFilter: string[] | null = null

  const tagFilters: { dimension: string; label: string }[] = []
  if (moduloFilter) tagFilters.push({ dimension: 'modulo', label: moduloFilter })
  if (temaFilter) tagFilters.push({ dimension: 'topico_edital', label: temaFilter })
  if (dificuldadeFilter) tagFilters.push({ dimension: 'dificuldade', label: dificuldadeFilter })

  if (tagFilters.length > 0) {
    // Para cada filtro de tag, busca IDs de questões
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
        // Tag não encontrada → nenhuma questão
        sets.push(new Set())
      }
    }
    // Interseção de todos os sets
    let intersection = sets[0] ?? new Set<string>()
    for (let i = 1; i < sets.length; i++) {
      intersection = new Set([...intersection].filter((id) => sets[i].has(id)))
    }
    questionIdFilter = [...intersection]
  }

  // Query principal
  let query = service
    .from('questions')
    .select(
      `id, question_number, stem, status, has_images, extraction_confidence, correct_answer,
       exams!inner(id, year, booklet_color, exam_boards(short_name), specialties(name)),
       question_tags!left(tags!inner(label, dimension, color))`,
      { count: 'exact' }
    )
    .order('question_number', { ascending: true })

  if (yearFilter) {
    query = query.eq('exams.year', yearFilter)
  }

  if (qFilter) {
    query = query.ilike('stem', `%${qFilter}%`)
  }

  if (questionIdFilter !== null) {
    if (questionIdFilter.length === 0) {
      return (
        <EmptyState
          params={params}
          modulos={modulos}
          temas={temas}
          dificuldades={dificuldades}
          years={years}
          total={0}
        />
      )
    }
    query = query.in('id', questionIdFilter)
  }

  const { data: questions, count } = await query.range(offset, offset + PAGE_SIZE - 1)

  const total = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Chips ativos
  const activeFilters: { label: string; removeKey: string }[] = []
  if (qFilter) activeFilters.push({ label: `"${qFilter}"`, removeKey: 'q' })
  if (moduloFilter) activeFilters.push({ label: `Módulo: ${moduloFilter}`, removeKey: 'modulo' })
  if (temaFilter) activeFilters.push({ label: `Tema: ${temaFilter}`, removeKey: 'tema' })
  if (dificuldadeFilter) activeFilters.push({ label: `Dificuldade: ${dificuldadeFilter}`, removeKey: 'dificuldade' })
  if (yearFilter) activeFilters.push({ label: `Ano: ${yearFilter}`, removeKey: 'year' })

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1
          className="font-[family-name:var(--font-syne)]"
          style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
        >
          Questões
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
          Exploração e busca no banco de questões
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
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            marginBottom: 14,
          }}
        >
          {/* Módulo */}
          <div>
            <label
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--mm-muted)',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 6,
              }}
            >
              Módulo
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Link
                href={buildUrl(params, { modulo: '', page: '1' })}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  textDecoration: 'none',
                  border:
                    !moduloFilter
                      ? '1px solid var(--mm-gold-border)'
                      : '1px solid var(--mm-line)',
                  background: !moduloFilter ? 'var(--mm-gold-bg)' : 'transparent',
                  color: !moduloFilter ? 'var(--mm-gold)' : 'var(--mm-muted)',
                }}
              >
                Todos
              </Link>
              {modulos.slice(0, 5).map((m) => (
                <Link
                  key={m.id as string}
                  href={buildUrl(params, { modulo: m.label as string, page: '1' })}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    textDecoration: 'none',
                    border:
                      moduloFilter === m.label
                        ? '1px solid var(--mm-gold-border)'
                        : '1px solid var(--mm-line)',
                    background: moduloFilter === m.label ? 'var(--mm-gold-bg)' : 'transparent',
                    color: moduloFilter === m.label ? 'var(--mm-gold)' : 'var(--mm-text2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: (m.color as string | null) ?? '#5A6880',
                      flexShrink: 0,
                    }}
                  />
                  {m.label as string}
                </Link>
              ))}
            </div>
          </div>

          {/* Tema */}
          <div>
            <label
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--mm-muted)',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 6,
              }}
            >
              Tema
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Link
                href={buildUrl(params, { tema: '', page: '1' })}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  textDecoration: 'none',
                  border: !temaFilter ? '1px solid var(--mm-gold-border)' : '1px solid var(--mm-line)',
                  background: !temaFilter ? 'var(--mm-gold-bg)' : 'transparent',
                  color: !temaFilter ? 'var(--mm-gold)' : 'var(--mm-muted)',
                }}
              >
                Todos
              </Link>
              {temas.slice(0, 5).map((t) => (
                <Link
                  key={t.id as string}
                  href={buildUrl(params, { tema: t.label as string, page: '1' })}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    textDecoration: 'none',
                    border:
                      temaFilter === t.label
                        ? '1px solid var(--mm-gold-border)'
                        : '1px solid var(--mm-line)',
                    background: temaFilter === t.label ? 'var(--mm-gold-bg)' : 'transparent',
                    color: temaFilter === t.label ? 'var(--mm-gold)' : 'var(--mm-text2)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.label as string}
                </Link>
              ))}
            </div>
          </div>

          {/* Dificuldade */}
          <div>
            <label
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--mm-muted)',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 6,
              }}
            >
              Dificuldade
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Link
                href={buildUrl(params, { dificuldade: '', page: '1' })}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  textDecoration: 'none',
                  border:
                    !dificuldadeFilter ? '1px solid var(--mm-gold-border)' : '1px solid var(--mm-line)',
                  background: !dificuldadeFilter ? 'var(--mm-gold-bg)' : 'transparent',
                  color: !dificuldadeFilter ? 'var(--mm-gold)' : 'var(--mm-muted)',
                }}
              >
                Todas
              </Link>
              {dificuldades.map((d) => (
                <Link
                  key={d.id as string}
                  href={buildUrl(params, { dificuldade: d.label as string, page: '1' })}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    textDecoration: 'none',
                    border:
                      dificuldadeFilter === d.label
                        ? '1px solid var(--mm-gold-border)'
                        : '1px solid var(--mm-line)',
                    background: dificuldadeFilter === d.label ? 'var(--mm-gold-bg)' : 'transparent',
                    color: dificuldadeFilter === d.label ? 'var(--mm-gold)' : 'var(--mm-text2)',
                  }}
                >
                  {d.label as string}
                </Link>
              ))}
            </div>
          </div>

          {/* Ano */}
          <div>
            <label
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--mm-muted)',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 6,
              }}
            >
              Ano
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Link
                href={buildUrl(params, { year: '', page: '1' })}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  textDecoration: 'none',
                  border: !yearFilter ? '1px solid var(--mm-gold-border)' : '1px solid var(--mm-line)',
                  background: !yearFilter ? 'var(--mm-gold-bg)' : 'transparent',
                  color: !yearFilter ? 'var(--mm-gold)' : 'var(--mm-muted)',
                }}
              >
                Todos
              </Link>
              {years.map((y) => (
                <Link
                  key={y}
                  href={buildUrl(params, { year: String(y), page: '1' })}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    textDecoration: 'none',
                    border:
                      yearFilter === y
                        ? '1px solid var(--mm-gold-border)'
                        : '1px solid var(--mm-line)',
                    background: yearFilter === y ? 'var(--mm-gold-bg)' : 'transparent',
                    color: yearFilter === y ? 'var(--mm-gold)' : 'var(--mm-text2)',
                  }}
                >
                  {y}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chips de filtros ativos + contador + ações */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            className="font-[family-name:var(--font-syne)]"
            style={{ fontSize: 13, fontWeight: 700, color: 'var(--mm-text)' }}
          >
            {total.toLocaleString('pt-BR')} questões encontradas
          </span>
          {activeFilters.map((f) => (
            <Link
              key={f.removeKey}
              href={buildUrl(params, { [f.removeKey]: '', page: '1' })}
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
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid var(--mm-line2)',
              background: 'transparent',
              color: 'var(--mm-muted)',
              cursor: 'not-allowed',
            }}
          >
            Exportar seleção →
          </button>
          <button
            disabled
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              border: 'none',
              background: 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))',
              color: '#0a0a0a',
              cursor: 'not-allowed',
              opacity: 0.6,
            }}
          >
            Gerar simulado
          </button>
        </div>
      </div>

      {/* Cards de questão */}
      {total === 0 ? (
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
          Nenhuma questão encontrada com os filtros aplicados.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(questions ?? []).map((q) => {
            const exam = q.exams as unknown as {
              id: string
              year: number
              booklet_color: string | null
              exam_boards: { short_name: string } | null
              specialties: { name: string } | null
            } | null

            const tags = (
              q.question_tags as unknown as
                | { tags: { label: string; dimension: string; color: string | null } }[]
                | null
            ) ?? []

            const moduloTag = tags.find((qt) => qt.tags?.dimension === 'modulo')?.tags
            const dificuldadeTag = tags.find((qt) => qt.tags?.dimension === 'dificuldade')?.tags
            const tipoTag = tags.find((qt) => qt.tags?.dimension === 'tipo_questao')?.tags

            const allVisibleTags = tags
              .filter((qt) => qt.tags)
              .slice(0, 5)

            const statusKey = (q.status as string) ?? 'pending_extraction'
            const sc = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.pending_extraction
            const stem = ((q.stem as string | null) ?? '').slice(0, 120)

            return (
              <div
                key={q.id as string}
                style={{
                  background: 'var(--mm-bg2)',
                  border: '1px solid var(--mm-line)',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                {/* Topo */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span
                    className="font-[family-name:var(--font-syne)]"
                    style={{ fontSize: 11, fontWeight: 700, color: 'var(--mm-gold)' }}
                  >
                    QUESTÃO {q.question_number as number}
                    {exam ? ` · ${exam.exam_boards?.short_name ?? 'TEMI'} ${exam.year}` : ''}
                  </span>
                  <span
                    style={{
                      background: sc.bg,
                      color: sc.color,
                      border: `1px solid ${sc.border}`,
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 20,
                    }}
                  >
                    {sc.label}
                  </span>
                </div>

                {/* Tags chips */}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                  {allVisibleTags.map((qt, i) => (
                    <span
                      key={i}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 20,
                        fontSize: 10,
                        border: '1px solid var(--mm-line2)',
                        color: 'var(--mm-text2)',
                        background: qt.tags.color
                          ? `${qt.tags.color}15`
                          : 'transparent',
                      }}
                    >
                      {qt.tags.label}
                    </span>
                  ))}
                </div>

                {/* Enunciado */}
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--mm-text2)',
                    marginBottom: 10,
                  }}
                >
                  {stem || '(sem enunciado)'}
                  {((q.stem as string | null) ?? '').length > 120 ? '…' : ''}
                </p>

                {/* Rodapé */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', gap: 12 }}>
                    {q.correct_answer && (
                      <span style={{ fontSize: 11, color: 'var(--mm-muted)' }}>
                        Gabarito:{' '}
                        <strong style={{ color: 'var(--mm-green)' }}>
                          {q.correct_answer as string}
                        </strong>
                      </span>
                    )}
                    {dificuldadeTag && (
                      <span style={{ fontSize: 11, color: 'var(--mm-muted)' }}>
                        Dif.:{' '}
                        <span style={{ color: 'var(--mm-text2)' }}>{dificuldadeTag.label}</span>
                      </span>
                    )}
                    {tipoTag && (
                      <span style={{ fontSize: 11, color: 'var(--mm-muted)' }}>
                        Tipo:{' '}
                        <span style={{ color: 'var(--mm-text2)' }}>{tipoTag.label}</span>
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/questoes/${q.id}`}
                    style={{
                      fontSize: 11,
                      color: 'var(--mm-gold)',
                      textDecoration: 'none',
                      fontWeight: 600,
                    }}
                  >
                    Ver questão →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--mm-muted)' }}>
            Página {page} de {totalPages} · {total} questões
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {page > 1 && (
              <Link
                href={buildUrl(params, { page: String(page - 1) })}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid var(--mm-line2)',
                  color: 'var(--mm-text2)',
                  textDecoration: 'none',
                }}
              >
                ← Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildUrl(params, { page: String(page + 1) })}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid var(--mm-line2)',
                  color: 'var(--mm-text2)',
                  textDecoration: 'none',
                }}
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

function EmptyState({
  params,
  modulos,
  temas,
  dificuldades,
  years,
  total,
}: {
  params: SearchParams
  modulos: { id: unknown; label: unknown; color: unknown }[]
  temas: { id: unknown; label: unknown }[]
  dificuldades: { id: unknown; label: unknown }[]
  years: number[]
  total: number
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          className="font-[family-name:var(--font-syne)]"
          style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
        >
          Questões
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
          {total} questões encontradas
        </p>
      </div>
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
        Nenhuma questão encontrada com os filtros aplicados.{' '}
        <Link
          href="/questoes"
          style={{ color: 'var(--mm-gold)', textDecoration: 'none' }}
        >
          Limpar filtros →
        </Link>
      </div>
    </div>
  )
}
