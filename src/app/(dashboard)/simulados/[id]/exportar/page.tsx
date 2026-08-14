import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { requireSimuladoAccess } from '@/lib/auth/guards'
import { ExportForm } from '@/components/simulados/export-form'
import { BackButton } from '@/components/ui'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fallback = { title: 'Exportar — Simulado — MedMaestro' }

  const service = createServiceClient()
  const { data } = await service.from('simulados').select('title, created_by').eq('id', id).single()
  if (!data) return fallback

  // Mesma checagem de dono/admin da página — não revela título de simulado
  // alheio via <title> mesmo quando o corpo da página vai dar notFound().
  const guard = await requireSimuladoAccess(data.created_by)
  if (!guard.ok) return fallback

  return { title: `Exportar — ${data.title ?? 'Simulado'} — MedMaestro` }
}

type FilterParts = {
  modulo?: string
  especialidade?: string
  yearLabel?: string
}

function extractFilters(filters: unknown): FilterParts {
  const out: FilterParts = {}
  if (!filters || typeof filters !== 'object') return out
  const f = filters as Record<string, unknown>
  if (typeof f.modulo === 'string') out.modulo = f.modulo
  else if (typeof f.module === 'string') out.modulo = f.module
  if (typeof f.especialidade === 'string') out.especialidade = f.especialidade
  else if (typeof f.specialty === 'string') out.especialidade = f.specialty
  if (Array.isArray(f.years) && f.years.length) {
    const years = (f.years as unknown[]).filter((y) => typeof y === 'number') as number[]
    if (years.length) {
      const min = Math.min(...years)
      const max = Math.max(...years)
      out.yearLabel = min === max ? `${min}` : `${min}–${max}`
    }
  } else if (typeof f.year_range === 'string') {
    out.yearLabel = f.year_range
  }
  return out
}

function summarizeFilters(parts: FilterParts, total: number): string {
  const labelParts: string[] = []
  if (parts.modulo) labelParts.push(parts.modulo)
  if (parts.especialidade) labelParts.push(parts.especialidade)
  if (parts.yearLabel) labelParts.push(parts.yearLabel)
  const filtroLabel = labelParts.length ? labelParts.join(' / ') : 'simulado completo'
  const plural = total === 1 ? 'questão selecionada' : 'questões selecionadas'
  return `${total} ${plural} (${filtroLabel})`
}

function previewSubtitle(parts: FilterParts, total: number): string {
  const left: string[] = []
  if (parts.modulo) left.push(parts.modulo)
  if (parts.especialidade) left.push(parts.especialidade)
  const right: string[] = []
  const plural = total === 1 ? 'questão' : 'questões'
  right.push(`${total} ${plural}`)
  if (parts.yearLabel) right.push(parts.yearLabel)
  const head = left.length ? left.join(' — ') : 'Simulado MedMaestro'
  return `${head} · ${right.join(' · ')}`
}

export default async function ExportarSimuladoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fmt?: string }>
}) {
  const { id } = await params
  const { fmt } = await searchParams
  const initialFormat =
    fmt === 'questoes' || fmt === 'comentarios' || fmt === 'ambos' ? fmt : undefined

  const service = createServiceClient()

  const { data: simulado } = await service
    .from('simulados')
    .select('id, title, filters_used, total_questions, created_by')
    .eq('id', id)
    .single()

  if (!simulado) notFound()

  // Autorização de leitura: dono OU admin/superadmin (mesma regra da página de
  // detalhe e do endpoint de export). Evita IDOR — terceiro não vê título,
  // filtros e contagem de simulado alheio por URL.
  const guard = await requireSimuladoAccess(simulado.created_by)
  if (!guard.ok) notFound()

  const { count: questionsCount } = await service
    .from('simulado_questions')
    .select('id', { count: 'exact', head: true })
    .eq('simulado_id', id)

  const total = questionsCount ?? simulado.total_questions ?? 0
  const filterParts = extractFilters(simulado.filters_used)
  const summary = summarizeFilters(filterParts, total)
  const previewLine = previewSubtitle(filterParts, total)

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/simulados/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {simulado.title}
        </Link>
        <BackButton href={`/simulados/${id}`} />
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold text-foreground">
          Exportar questões
        </h1>
        <p className="text-sm text-muted-foreground">{summary}</p>
      </header>

      <ExportForm
        simuladoId={id}
        filtersSummary={summary}
        previewSubtitle={previewLine}
        totalQuestions={total}
        initialFormat={initialFormat}
      />
    </div>
  )
}
