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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1
            className="font-[family-name:var(--font-syne)]"
            style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
          >
            Variações
          </h1>
          <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
            Gere variações de questões existentes (mesma habilidade, dificuldade ajustável)
          </p>
        </div>
        <Link
          href="/revisao-variacoes"
          style={{
            background: 'var(--mm-bg2)',
            border: '1px solid var(--mm-line2)',
            color: 'var(--mm-gold)',
            fontFamily: 'var(--font-syne)',
            fontSize: 12,
            fontWeight: 700,
            padding: '8px 14px',
            borderRadius: 8,
            textDecoration: 'none',
          }}
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
