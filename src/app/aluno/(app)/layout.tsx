import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { flags } from '@/lib/flags'
import { AlunoSidebar } from '@/components/aluno/aluno-sidebar'

/**
 * Área autenticada do aluno (feature 001).
 * Grupo de rota (app) -> NÃO entra na URL; estas páginas ficam em /aluno/*.
 * Login e cadastro vivem FORA deste grupo (/aluno/login, /aluno/cadastro),
 * então o redirect abaixo não causa loop.
 *
 * Guard: exige sessão E papel `aluno`. Staff é mandado ao back-office.
 *
 * Shell (protótipo Templates de Designer/prototipo_camada_aluno_afya.html):
 * sidebar fixa + conteúdo. Cada página mantém seu próprio título/saudação —
 * este layout não duplica isso, só monta a casca.
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
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role && profile.role !== 'aluno') redirect('/dashboard')

  const userName = profile?.full_name?.trim() || user.email?.split('@')[0] || 'Aluno'

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <a href="#main-content" className="skip-to-content">
        Ir para o conteúdo
      </a>
      <AlunoSidebar userName={userName} userSub="Candidata · TEMI 2026" />
      <main id="main-content" className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">{children}</div>
      </main>
    </div>
  )
}
