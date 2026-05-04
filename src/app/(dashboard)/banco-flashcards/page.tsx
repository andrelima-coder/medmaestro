import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  listBancoExams,
  listBancoFlashcards,
  type BancoFilter,
} from './actions'
import { BancoFlashcardsClient } from './banco-flashcards-client'
import { ExportFlashcardsButton } from '@/components/flashcards/export-button'

export const metadata = { title: 'Banco de flashcards — MedMaestro' }
export const dynamic = 'force-dynamic'

function parseStatus(v?: string): BancoFilter['status'] {
  if (v === 'approved' || v === 'pending' || v === 'all') return v
  return 'all'
}

export default async function BancoFlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<{
    exam?: string
    type?: string
    status?: string
    q?: string
    diff?: string
    page?: string
  }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const filter: BancoFilter = {
    examId: sp.exam || undefined,
    cardType: sp.type || 'all',
    status: parseStatus(sp.status),
    query: sp.q || undefined,
    difficulty: sp.diff ? Number(sp.diff) : null,
    page: sp.page ? Math.max(1, Number(sp.page)) : 1,
  }

  const [exams, result] = await Promise.all([
    listBancoExams(),
    listBancoFlashcards(filter),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h1
            className="font-[family-name:var(--font-syne)]"
            style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
          >
            Banco de flashcards
          </h1>
          <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
            {result.total} flashcard{result.total === 1 ? '' : 's'} no banco — clique para
            editar inline (rich text)
          </p>
        </div>
        <ExportFlashcardsButton
          examId={filter.examId}
          approvedOnly={filter.status !== 'pending'}
        />
      </div>

      <BancoFlashcardsClient
        result={result}
        exams={exams}
        initialFilter={{
          examId: filter.examId ?? '',
          cardType: filter.cardType ?? 'all',
          status: filter.status ?? 'all',
          query: filter.query ?? '',
          difficulty: filter.difficulty ?? null,
          page: filter.page ?? 1,
        }}
      />
    </div>
  )
}
