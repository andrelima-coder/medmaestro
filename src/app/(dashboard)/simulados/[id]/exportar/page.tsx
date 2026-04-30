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

function summarizeFilters(filters: unknown, total: number): string {
  const parts: string[] = []
  if (filters && typeof filters === 'object') {
    const f = filters as Record<string, unknown>
    if (typeof f.modulo === 'string') parts.push(f.modulo)
    else if (typeof f.module === 'string') parts.push(f.module)
    if (typeof f.especialidade === 'string') parts.push(f.especialidade)
    else if (typeof f.specialty === 'string') parts.push(f.specialty)
    if (Array.isArray(f.years) && f.years.length) {
      const years = (f.years as unknown[]).filter((y) => typeof y === 'number') as number[]
      if (years.length) {
        const min = Math.min(...years)
        const max = Math.max(...years)
        parts.push(min === max ? `${min}` : `${min}–${max}`)
      }
    } else if (typeof f.year_range === 'string') {
      parts.push(f.year_range)
    }
  }
  const filtroLabel = parts.length ? parts.join(' / ') : 'simulado completo'
  const plural = total === 1 ? 'questão selecionada' : 'questões selecionadas'
  return `${total} ${plural} (${filtroLabel})`
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
  const summary = summarizeFilters(simulado.filters_used, total)

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

      <header className="flex flex-col gap-1 items-center text-center">
        <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold text-foreground">
          Exportar questões
        </h1>
        <p className="text-sm text-muted-foreground">{summary}</p>
      </header>

      <ExportForm simuladoId={id} filtersSummary={summary} totalQuestions={total} />
    </div>
  )
}
