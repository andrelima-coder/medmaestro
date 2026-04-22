import { createClient } from '@/lib/supabase/server'
import { ROLE_LABELS } from '@/types'

export const metadata = { title: 'Dashboard — MedMaestro' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user!.id)
    .single()

  const name = profile?.full_name ?? user?.email ?? 'Usuário'
  const roleLabel = ROLE_LABELS[profile?.role as keyof typeof ROLE_LABELS] ?? ''

  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Olá, {name.split(' ')[0]}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {roleLabel} · MedMaestro
        </p>
      </div>

      <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 glow-purple">
        <p className="text-sm text-muted-foreground">
          Sessões 1.2 concluída. Sidebar e header serão implementados na Sessão 1.3.
        </p>
      </div>
    </div>
  )
}
