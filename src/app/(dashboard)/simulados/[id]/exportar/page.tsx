import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ExportForm } from '@/components/simulados/export-form'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const service = createServiceClient()
  const { data } = await service.from('simulados').select('title').eq('id', id).single()
  return { title: `Exportar — ${data?.title ?? 'Simulado'} — MedMaestro` }
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
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: simulado } = await service
    .from('simulados')
    .select('id, title, filters_used, total_questions, created_by')
    .eq('id', id)
    .single()

  if (!simulado) notFound()

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
      <div className="flex items-center gap-3">
        <Link
          href={`/simulados/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {simulado.title}
        </Link>
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
      />
    </div>
  )
}
