import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getGoalAndToday, getStreak } from '@/lib/aluno/estudo'
import { GoalSetter } from './home-client'

export const metadata = { title: 'Área do Aluno — MedMaestro' }

export default async function AlunoHomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let nome: string | null = null
  let goal = 10
  let today = 0
  let streak = 0

  if (user) {
    const service = createServiceClient()
    const { data: profile } = await service
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
    nome = profile?.full_name ?? null
    const gt = await getGoalAndToday(service, user.id)
    goal = gt.goal
    today = gt.today
    streak = await getStreak(service, user.id)
  }

  const pct = goal > 0 ? Math.min(100, Math.round((today / goal) * 100)) : 0

  return (
    <section className="mt-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">
        Olá{nome ? `, ${nome}` : ''} 👋
      </h1>

      {/* Engajamento */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Sequência</div>
          <div className="mt-1 text-2xl font-bold text-foreground">🔥 {streak} dia{streak === 1 ? '' : 's'}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Meta de hoje</div>
          <div className="mt-1 text-2xl font-bold text-foreground">
            {today}/{goal}
          </div>
          <div className="mt-2 h-2 w-full rounded bg-muted">
            <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Ajustar meta diária</div>
          <GoalSetter initial={goal} />
        </div>
      </div>

      {/* Atalhos */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Atalho href="/aluno/praticar" titulo="Praticar" desc="Questões avulsas com correção na hora" />
        <Atalho href="/aluno/revisao" titulo="Revisão de erros" desc="Revise o que você errou" />
        <Atalho href="/aluno/desempenho" titulo="Meu desempenho" desc="Radar por módulo e evolução" />
      </div>
    </section>
  )
}

function Atalho({ href, titulo, desc }: { href: string; titulo: string; desc: string }) {
  return (
    <a
      href={href}
      className="rounded-2xl border border-border bg-card p-5 transition hover:border-primary"
    >
      <div className="font-semibold text-foreground">{titulo}</div>
      <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
    </a>
  )
}
