import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { Card, CardBody, Badge, TagChip } from '@/components/ui'
import { FilterDropdown } from '@/components/questoes/filter-dropdown'

export const metadata = { title: 'Questões — MedMaestro' }

const PAGE_SIZE = 20

// Chaves de filtro suportadas na URL. Valores multivalorados são CSV (slug,slug).
type SearchParams = {
  banca?: string
  modulo?: string
  tema?: string
  tipo?: string
  recurso?: string
  dificuldade?: string
  year?: string
  status?: string
  classificacao?: string
  q?: string
  page?: string
}

const URL_KEYS: (keyof SearchParams)[] = [
  'banca', 'modulo', 'tema', 'tipo', 'recurso', 'dificuldade',
  'year', 'status', 'classificacao', 'q', 'page',
]

type BadgeTone = 'green' | 'gold' | 'red' | 'blue' | 'muted' | 'orange' | 'purple'

// Status reais do enum question_status (com rótulos PT-BR).
const STATUS_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
  pending_extraction: { label: 'Aguardando extração', tone: 'muted' },
  pending_review: { label: 'Aguardando revisão', tone: 'gold' },
  in_review: { label: 'Em revisão', tone: 'blue' },
  pending_approval: { label: 'Aguardando aprovação', tone: 'gold' },
  approved: { label: 'Aprovada', tone: 'green' },
  published: { label: 'Publicada', tone: 'green' },
  rejected: { label: 'Rejeitada', tone: 'red' },
  needs_attention: { label: 'Requer atenção', tone: 'orange' },
}

const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([slug, c]) => ({
  slug,
  label: c.label,
}))

const CLASSIFICACAO_OPTIONS = [
  { slug: 'classificadas', label: 'Classificadas' },
  { slug: 'nao', label: 'Não classificadas' },
]

/* ----------------------------- URL helpers ----------------------------- */

function parseList(v?: string): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

// Constrói uma URL aplicando overrides. '' remove a chave.
function buildUrl(params: SearchParams, overrides: Partial<SearchParams>): string {
  const merged = { ...params, ...overrides }
  const p = new URLSearchParams()
  for (const k of URL_KEYS) {
    const val = merged[k]
    if (val) p.set(k, val)
  }
  return `/questoes${p.toString() ? '?' + p.toString() : ''}`
}

// Liga/desliga um slug numa chave CSV multivalorada (e volta pra página 1).
function buildToggleUrl(
  params: SearchParams,
  key: keyof SearchParams,
  slug: string
): string {
  const list = parseList(params[key])
  const i = list.indexOf(slug)
  if (i >= 0) list.splice(i, 1)
  else list.push(slug)
  return buildUrl(params, { [key]: list.join(','), page: '1' })
}

/* -------------------------------- page --------------------------------- */

type TagOption = { slug: string; label: string; color?: string | null }

export default async function QuestoesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const qFilter = params.q?.trim() ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1') || 1)
  const offset = (page - 1) * PAGE_SIZE

  const service = createServiceClient()

  // Opções dos filtros (apenas dimensões com tags aparecem).
  const [modRes, temaRes, tipoRes, recRes, difRes, boardRes, yearRes] =
    await Promise.all([
      service.from('tags').select('slug, label, color').eq('dimension', 'modulo').order('display_order'),
      service.from('tags').select('slug, label, color').eq('dimension', 'topico_edital').is('parent_tag_id', null).order('display_order'),
      service.from('tags').select('slug, label, color').eq('dimension', 'tipo_questao').order('display_order'),
      service.from('tags').select('slug, label, color').eq('dimension', 'recurso_visual').order('display_order'),
      service.from('tags').select('slug, label, color').eq('dimension', 'dificuldade').order('display_order'),
      service.from('exam_boards').select('slug, short_name').order('short_name'),
      service.from('exams').select('year').order('year', { ascending: false }),
    ])

  const modulos = (modRes.data ?? []) as TagOption[]
  const temas = (temaRes.data ?? []) as TagOption[]
  const tipos = (tipoRes.data ?? []) as TagOption[]
  const recursos = (recRes.data ?? []) as TagOption[]
  const dificuldades = (difRes.data ?? []) as TagOption[]
  const bancas = ((boardRes.data ?? []) as { slug: string; short_name: string }[]).map(
    (b) => ({ slug: b.slug, label: b.short_name })
  )
  const years = [...new Set((yearRes.data ?? []).map((e) => e.year as number))]

  // Busca filtrada via RPC (filtragem + paginação no banco).
  const { data: rpcData } = await service.rpc('search_questions', {
    p_modulo: parseList(params.modulo),
    p_tema: parseList(params.tema),
    p_tipo: parseList(params.tipo),
    p_recurso: parseList(params.recurso),
    p_dificuldade: parseList(params.dificuldade),
    p_banca: parseList(params.banca),
    p_year: parseList(params.year).map(Number).filter((n) => !Number.isNaN(n)),
    p_status: parseList(params.status),
    p_classificacao: params.classificacao || null,
    p_search: qFilter || null,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  })

  type QuestionRow = {
    id: string
    question_number: number
    stem: string
    stem_len: number
    status: string
    has_images: boolean
    correct_answer: string | null
    year: number
    board: string | null
    tags: { label: string; dimension: string; color: string | null }[]
  }

  const result = (rpcData?.[0] ?? { total: 0, rows: [] }) as {
    total: number
    rows: QuestionRow[]
  }
  const total = Number(result.total) || 0
  const rows = result.rows ?? []
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Mapa slug→label para exibir os chips de filtros ativos.
  const labelMaps: Record<string, Record<string, string>> = {
    banca: Object.fromEntries(bancas.map((b) => [b.slug, b.label])),
    modulo: Object.fromEntries(modulos.map((m) => [m.slug, m.label])),
    tema: Object.fromEntries(temas.map((t) => [t.slug, t.label])),
    tipo: Object.fromEntries(tipos.map((t) => [t.slug, t.label])),
    recurso: Object.fromEntries(recursos.map((r) => [r.slug, r.label])),
    dificuldade: Object.fromEntries(dificuldades.map((d) => [d.slug, d.label])),
    status: Object.fromEntries(STATUS_OPTIONS.map((s) => [s.slug, s.label])),
    classificacao: Object.fromEntries(CLASSIFICACAO_OPTIONS.map((c) => [c.slug, c.label])),
  }
  const dimPrefix: Record<string, string> = {
    banca: 'Banca', modulo: 'Módulo', tema: 'Tema', tipo: 'Tipo',
    recurso: 'Imagem', dificuldade: 'Dificuldade', year: 'Ano',
    status: 'Status', classificacao: '',
  }

  // Chips de filtros ativos (cada slug é removível).
  const activeChips: { key: keyof SearchParams; slug: string; label: string }[] = []
  if (qFilter) activeChips.push({ key: 'q', slug: qFilter, label: `"${qFilter}"` })
  for (const key of ['banca', 'modulo', 'tema', 'tipo', 'recurso', 'dificuldade', 'year', 'status'] as const) {
    for (const slug of parseList(params[key])) {
      const lbl = labelMaps[key]?.[slug] ?? slug
      activeChips.push({ key, slug, label: `${dimPrefix[key]}: ${lbl}` })
    }
  }
  if (params.classificacao) {
    const lbl = labelMaps.classificacao[params.classificacao] ?? params.classificacao
    activeChips.push({ key: 'classificacao', slug: params.classificacao, label: lbl })
  }
  const hasActive = activeChips.length > 0

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-syne)] text-xl font-bold text-foreground">
          Banco de Questões
        </h1>
        <p className="mt-1 text-[13px] text-[var(--mm-muted)]">
          {total.toLocaleString('pt-BR')} questões{hasActive ? ' · resultados filtrados' : ' no banco'}
        </p>
      </div>

      {/* Barra de filtros (dropdowns compactos multi-seleção) */}
      <Card>
        <CardBody className="py-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <FilterDropdown label="Banca" urlKey="banca" options={bancas} />
            <FilterDropdown label="Módulo" urlKey="modulo" options={modulos} colored />
            {temas.length > 0 && (
              <FilterDropdown label="Tema (edital)" urlKey="tema" options={temas} colored />
            )}
            <FilterDropdown label="Tipo de questão" urlKey="tipo" options={tipos} />
            <FilterDropdown label="Imagem / Recurso" urlKey="recurso" options={recursos} />
            <FilterDropdown label="Dificuldade" urlKey="dificuldade" options={dificuldades} />
            <FilterDropdown
              label="Ano"
              urlKey="year"
              options={years.map((y) => ({ slug: String(y), label: String(y) }))}
            />
            <FilterDropdown label="Status" urlKey="status" options={STATUS_OPTIONS} />
            <FilterDropdown
              label="Classificação"
              urlKey="classificacao"
              options={CLASSIFICACAO_OPTIONS}
              single
            />
          </div>
        </CardBody>
      </Card>

      {/* Resumo + filtros ativos + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-[family-name:var(--font-syne)] text-sm font-bold text-foreground">
            {total.toLocaleString('pt-BR')} questões encontradas
          </span>
          {activeChips.map((c) => (
            <Link
              key={`${c.key}:${c.slug}`}
              href={
                c.key === 'q' || c.key === 'classificacao'
                  ? buildUrl(params, { [c.key]: '', page: '1' })
                  : buildToggleUrl(params, c.key, c.slug)
              }
              className="inline-flex items-center gap-1 rounded-full border border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)] px-2.5 py-0.5 text-[11px] text-[var(--mm-gold)] no-underline transition-opacity hover:opacity-80"
            >
              {c.label}
              <span aria-hidden className="opacity-70">×</span>
            </Link>
          ))}
          {hasActive && (
            <Link
              href="/questoes"
              className="text-[11px] text-[var(--mm-muted)] no-underline hover:text-foreground hover:underline"
            >
              Limpar tudo
            </Link>
          )}
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
              background: 'linear-gradient(135deg, var(--mm-gold) 0%, var(--mm-orange) 100%)',
              boxShadow: '0 4px 20px rgba(201,120,30,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
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
            Nenhuma questão encontrada com os filtros aplicados.{' '}
            {hasActive && (
              <Link href="/questoes" className="text-[var(--mm-gold)] no-underline hover:underline">
                Limpar filtros →
              </Link>
            )}
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((q) => {
            const tags = q.tags ?? []
            const dificuldadeTag = tags.find((t) => t.dimension === 'dificuldade')
            const tipoTag = tags.find((t) => t.dimension === 'tipo_questao')
            const visibleTags = tags.slice(0, 5)
            const sc = STATUS_CONFIG[q.status] ?? { label: q.status, tone: 'muted' as BadgeTone }

            return (
              <Card key={q.id}>
                <CardBody className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-[family-name:var(--font-syne)] text-[11px] font-bold text-[var(--mm-gold)]">
                      QUESTÃO {q.question_number}
                      {` · ${q.board ?? 'TEMI'} ${q.year}`}
                    </span>
                    <Badge tone={sc.tone}>{sc.label}</Badge>
                  </div>

                  {visibleTags.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {visibleTags.map((t, i) => (
                        <TagChip key={i} style={t.color ? { background: `${t.color}15` } : undefined}>
                          {t.label}
                        </TagChip>
                      ))}
                    </div>
                  )}

                  <p className="mb-2.5 text-[13px] leading-[1.6] text-[var(--mm-text2)]">
                    {q.stem || '(sem enunciado)'}
                    {q.stem_len > 160 ? '…' : ''}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-3 text-[11px] text-[var(--mm-muted)]">
                      {q.correct_answer && (
                        <span>
                          Gabarito:{' '}
                          <strong className="text-[var(--mm-green)]">{q.correct_answer}</strong>
                        </span>
                      )}
                      {dificuldadeTag && (
                        <span>Dif.: <span className="text-[var(--mm-text2)]">{dificuldadeTag.label}</span></span>
                      )}
                      {tipoTag && (
                        <span>Tipo: <span className="text-[var(--mm-text2)]">{tipoTag.label}</span></span>
                      )}
                      {q.has_images && <span className="text-[var(--mm-text2)]">Com imagem</span>}
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
            Página {page} de {totalPages} · {total.toLocaleString('pt-BR')} questões
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

