import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMinhaBancaAtiva } from '@/lib/aluno/mentoria'
import { getFlashcardFila } from '@/lib/aluno/flashcards'
import { SemMatricula } from '@/components/aluno/sem-matricula'
import { FlashcardsClient } from './flashcards-client'

export const metadata = { title: 'Flashcards — MedMaestro' }

export default async function FlashcardsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/aluno/login')

  const banca = await getMinhaBancaAtiva(supabase)
  if (!banca) return <SemMatricula />

  const cards = await getFlashcardFila(supabase, 20)
  return <FlashcardsClient cards={cards} />
}
