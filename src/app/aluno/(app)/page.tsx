import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Área do Aluno — MedMaestro' }

/**
 * Landing autenticada do aluno (/aluno).
 * Placeholder da Fase 1 (T012): lista de campanhas/simulados entra nos
 * componentes seguintes do núcleo (T015/T017).
 */
export default async function AlunoHomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    : { data: null }

  return (
    <section className="mt-8">
      <h1 className="text-2xl font-bold text-foreground">
        Olá{profile?.full_name ? `, ${profile.full_name}` : ''} 👋
      </h1>
      <p className="mt-2 text-muted-foreground">
        Sua área de simulados aparecerá aqui. Em breve você verá os simulados disponíveis para realização.
      </p>
    </section>
  )
}
