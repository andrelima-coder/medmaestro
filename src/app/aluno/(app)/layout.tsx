import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { flags } from '@/lib/flags'

/**
 * Área autenticada do aluno (feature 001).
 * Grupo de rota (app) -> NÃO entra na URL; estas páginas ficam em /aluno/*.
 * Login e cadastro vivem FORA deste grupo (/aluno/login, /aluno/cadastro),
 * então o redirect abaixo não causa loop.
 *
 * Guard: exige sessão E papel `aluno`. Staff é mandado ao back-office.
 */
export default async function AlunoAppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!flags.alunoLayer) redirect('/aluno/login')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/aluno/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role && profile.role !== 'aluno') redirect('/dashboard')

  return (
    <div className="min-h-screen bg-background">
      <main id="main-content" className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        {children}
      </main>
    </div>
  )
}
