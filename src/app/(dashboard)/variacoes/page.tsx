import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  listExamsForVariationsFilter,
  listQuestionsForVariations,
} from './actions'
import { VariacoesClient } from './variacoes-client'

export const metadata = { title: 'Variações — MedMaestro' }

export default async function VariacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; only_pending?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const filter = {
    examId: sp.exam || undefined,
    withoutVariationOnly: sp.only_pending === '1',
  }

  const [exams, rows] = await Promise.all([
    listExamsForVariationsFilter(),
    listQuestionsForVariations(filter),
  ])

  const service = createServiceClient()
  const { count: pendingCount } = await service
    .from('question_variations')
    .select('*', { count: 'exact', head: true })
    .eq('approved', false)
    .is('promoted_question_id', null)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-syne)] text-xl font-bold text-foreground">
            Variações
          </h1>
          <p className="mt-1 text-[13px] text-[var(--mm-muted)]">
            Gere variações de questões existentes (mesma habilidade, dificuldade ajustável)
          </p>
        </div>
        <Link
          href="/revisao-variacoes"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--mm-border-default)] bg-transparent px-3.5 py-2 font-[family-name:var(--font-syne)] text-xs font-bold text-[var(--mm-gold)] no-underline transition-colors hover:border-[var(--mm-border-active)]"
        >
          Revisar pendentes ({pendingCount ?? 0})
        </Link>
      </div>

      <VariacoesClient
        rows={rows}
        exams={exams}
        initialFilter={{
          examId: filter.examId ?? '',
          onlyPending: filter.withoutVariationOnly,
        }}
      />
    </div>
  )
}
