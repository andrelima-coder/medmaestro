import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  listExamsForFlashcardsFilter,
  listQuestionsForFlashcards,
} from './actions'
import { FlashcardsClient } from './flashcards-client'
import { ExportFlashcardsButton } from '@/components/flashcards/export-button'

export const metadata = { title: 'Flashcards — MedMaestro' }

export default async function FlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; only_pending?: string; low_conf?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const filter = {
    examId: sp.exam || undefined,
    withoutFlashcardOnly: sp.only_pending === '1',
    lowConfidenceOnly: sp.low_conf === '1',
  }

  const [exams, rows] = await Promise.all([
    listExamsForFlashcardsFilter(),
    listQuestionsForFlashcards(filter),
  ])

  const service = createServiceClient()
  const { count: pendingCount } = await service
    .from('flashcards')
    .select('*', { count: 'exact', head: true })
    .eq('approved', false)

  return (
    <div className="flex flex-col gap-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1
            className="font-[family-name:var(--font-syne)]"
            style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
          >
            Flashcards
          </h1>
          <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
            Geração automática de cards Q&A e cloze para revisão espaçada
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ExportFlashcardsButton examId={filter.examId} approvedOnly />
          <Link
            href="/revisao-flashcards"
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
      </div>

      <FlashcardsClient
        rows={rows}
        exams={exams}
        initialFilter={{
          examId: filter.examId ?? '',
          onlyPending: filter.withoutFlashcardOnly,
          lowConf: filter.lowConfidenceOnly,
        }}
      />
    </div>
  )
}
