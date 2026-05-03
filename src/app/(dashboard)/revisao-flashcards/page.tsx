import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listPendingFlashcards } from '../flashcards/actions'
import { RevisaoFlashcardsClient } from './revisao-flashcards-client'
import { ExportFlashcardsButton } from '@/components/flashcards/export-button'

export const metadata = { title: 'Revisar flashcards — MedMaestro' }

export default async function RevisaoFlashcardsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cards = await listPendingFlashcards()

  return (
    <div className="flex flex-col gap-6">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1
            className="font-[family-name:var(--font-syne)]"
            style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
          >
            Revisar flashcards
          </h1>
          <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
            {cards.length} card{cards.length === 1 ? '' : 's'} pendente
            {cards.length === 1 ? '' : 's'} de aprovação · atalhos: Espaço (virar) · A
            (aprovar) · D (descartar) · E (editar)
          </p>
        </div>
        <ExportFlashcardsButton approvedOnly label="Exportar aprovados" />
      </div>

      {cards.length === 0 ? (
        <div
          style={{
            background: 'var(--mm-surface)',
            border: '1px solid var(--mm-line)',
            borderRadius: 12,
            padding: 40,
            textAlign: 'center',
            color: 'var(--mm-muted)',
            fontSize: 13,
          }}
        >
          Nenhum flashcard pendente. Vá para Flashcards → gerar novos.
        </div>
      ) : (
        <RevisaoFlashcardsClient cards={cards} />
      )}
    </div>
  )
}
