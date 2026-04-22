import Link from 'next/link'
import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/service'
import { QuestoesFilters } from '@/components/questoes/filters'
import { STATUS_LABELS } from '@/types'
import type { QuestionStatus } from '@/types'

export const metadata = { title: 'Questões — MedMaestro' }

const PAGE_SIZE = 20

const STATUS_CLASSES: Record<string, string> = {
  pending_extraction: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  in_review: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  approved: 'bg-green-500/15 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
  published: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}

type SearchParams = {
  q?: string
  status?: string
  year?: string
  board?: string
  modulo?: string
  page?: string
}

export default async function QuestoesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const status = params.status ?? ''
  const year = params.year ? parseInt(params.year) : null
  const board = params.board ?? ''
  const modulo = params.modulo ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1'))
  const offset = (page - 1) * PAGE_SIZE

  const service = createServiceClient()

  // Carrega filtros disponíveis em paralelo
  const [boardsRes, yearsRes, modulosRes] = await Promise.all([
    service.from('exam_boards').select('slug, short_name').order('short_name'),
    service.from('exams').select('year').order('year', { ascending: false }),
    service.from('tags').select('label').eq('dimension', 'modulo').eq('is_active', true).order('label'),
  ])

  const boards = boardsRes.data ?? []
  const years = [...new Set((yearsRes.data ?? []).map((e) => e.year))]
  const modulos = (modulosRes.data ?? []).map((t) => t.label)

  // Monta query principal
  let query = service
    .from('questions')
    .select(
      `id, question_number, stem, status, has_images, extraction_confidence,
       exams!left(year, booklet_color, exam_boards(short_name, slug), specialties(name)),
       question_tags!left(tags!inner(label, dimension))`,
      { count: 'exact' }
    )

  if (q) {
    query = query.textSearch('stem_tsv', q, { type: 'websearch', config: 'portuguese' })
  }

  if (status) {
    query = query.eq('status', status)
  }

  if (year) {
    query = query.eq('exams.year', year)
  }

  if (board) {
    query = query.eq('exams.exam_boards.slug', board)
  }

  // Filtro de módulo: busca IDs de questões com essa tag e filtra
  let questionIdsForModulo: string[] | null = null
  if (modulo) {
    const { data: tagRows } = await service
      .from('tags')
      .select('id')
      .eq('dimension', 'modulo')
      .eq('label', modulo)
      .limit(1)
      .single()

    if (tagRows?.id) {
      const { data: qtRows } = await service
        .from('question_tags')
        .select('question_id')
        .eq('tag_id', tagRows.id)
      questionIdsForModulo = (qtRows ?? []).map((r) => r.question_id)
    }
  }

  if (questionIdsForModulo !== null) {
    if (questionIdsForModulo.length > 0) {
      query = query.in('id', questionIdsForModulo)
    } else {
      // Nenhuma questão com esse módulo
      return renderEmpty(boards, years, modulos, params, 0)
    }
  }

  const { data: questions, count } = await query
    .order('question_number', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)

  const total = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (total === 0) {
    return renderEmpty(boards, years, modulos, params, 0)
  }

  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Questões</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total} questão{total !== 1 ? 's' : ''}
            {q ? ` · busca: "${q}"` : ''}
          </p>
        </div>
      </div>

      <Suspense>
        <QuestoesFilters
          boards={boards}
          years={years}
          modulos={modulos}
          current={params}
        />
      </Suspense>

      <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/7 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Questão</th>
              <th className="px-4 py-3 font-medium">Exame</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Módulo</th>
              <th className="px-4 py-3 font-medium text-center">Img</th>
              <th className="px-4 py-3 font-medium">Conf.</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(questions ?? []).map((q) => {
              const exam = q.exams as unknown as {
                year: number
                booklet_color: string | null
                exam_boards: { short_name: string; slug: string } | null
                specialties: { name: string } | null
              } | null

              const tags = (q.question_tags as unknown as { tags: { label: string; dimension: string } }[] | null) ?? []
              const moduloTag = tags.find((qt) => qt.tags?.dimension === 'modulo')?.tags?.label ?? null

              const stem = (q.stem ?? '').slice(0, 90) + ((q.stem?.length ?? 0) > 90 ? '…' : '')
              const statusKey = (q.status ?? 'pending_extraction') as QuestionStatus

              return (
                <tr
                  key={q.id}
                  className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors"
                >
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-medium text-foreground">Q{q.question_number}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{stem || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {exam?.exam_boards?.short_name ?? '—'}
                    {exam ? ` ${exam.year}` : ''}
                    {exam?.booklet_color ? ` · ${exam.booklet_color.charAt(0).toUpperCase() + exam.booklet_color.slice(1)}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[statusKey] ?? STATUS_CLASSES.pending_extraction}`}>
                      {STATUS_LABELS[statusKey] ?? statusKey}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {moduloTag ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-xs">
                    {(q.has_images as boolean | null) ? (
                      <span className="text-purple-400">⬛</span>
                    ) : (
                      <span className="text-white/20">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                    {q.extraction_confidence != null ? `${q.extraction_confidence}%` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/questoes/${q.id}`}
                      className="text-xs font-medium text-primary hover:underline whitespace-nowrap"
                    >
                      Ver →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildPageUrl(params, page - 1)}
                className="rounded-lg border border-white/8 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
              >
                ← Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildPageUrl(params, page + 1)}
                className="rounded-lg border border-white/8 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
              >
                Próximo →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function buildPageUrl(params: SearchParams, newPage: number): string {
  const p = new URLSearchParams()
  if (params.q) p.set('q', params.q)
  if (params.status) p.set('status', params.status)
  if (params.year) p.set('year', params.year)
  if (params.board) p.set('board', params.board)
  if (params.modulo) p.set('modulo', params.modulo)
  p.set('page', String(newPage))
  return `/questoes?${p.toString()}`
}

function renderEmpty(
  boards: { slug: string; short_name: string }[],
  years: number[],
  modulos: string[],
  params: SearchParams,
  _total: number
) {
  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Questões</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">0 questões</p>
      </div>
      <Suspense>
        <QuestoesFilters boards={boards} years={years} modulos={modulos} current={params} />
      </Suspense>
      <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-10 text-center text-sm text-muted-foreground">
        Nenhuma questão encontrada.
      </div>
    </div>
  )
}
