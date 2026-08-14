import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getGoalAndToday, getStreak, getPracticeLast7Days } from '@/lib/aluno/estudo'
import { GoalSetter } from '../home-client'

export const metadata = { title: 'Metas — MedMaestro' }

const DIA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export default async function MetasPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/aluno/login')

  const service = createServiceClient()
  const [{ goal, today }, streak, last7] = await Promise.all([
    getGoalAndToday(service, user.id),
    getStreak(service, user.id),
    getPracticeLast7Days(service, user.id),
  ])
  const pct = goal > 0 ? Math.min(100, Math.round((today / goal) * 100)) : 0
  const maxDia = Math.max(1, ...last7.map((d) => d.count))

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground">Metas</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground">Sequência</div>
          <div className="mt-1 text-2xl font-bold text-foreground">
            🔥 {streak} dia{streak === 1 ? '' : 's'}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground">Meta de hoje</div>
          <div className="mt-1 text-2xl font-bold text-foreground">
            {today}/{goal}
          </div>
          <div className="mt-2 h-2 w-full rounded bg-muted">
            <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground">Ajustar meta diária</div>
          <GoalSetter initial={goal} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-base font-bold text-foreground">Últimos 7 dias</h2>
        <p className="mt-1 text-sm text-muted-foreground">Questões praticadas por dia.</p>
        <div className="mt-4 flex items-end gap-3">
          {last7.map((d) => {
            const alturaPct = Math.round((d.count / maxDia) * 100)
            const dia = DIA_SEMANA[new Date(d.date + 'T00:00:00').getDay()]
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-24 w-full items-end rounded-lg bg-muted/40 p-1">
                  <div
                    className="w-full rounded bg-primary transition-all"
                    style={{ height: d.count > 0 ? `${Math.max(8, alturaPct)}%` : '0%' }}
                  />
                </div>
                <div className="text-[11px] font-semibold text-muted-foreground">{dia}</div>
                <div className="text-xs font-bold text-foreground">{d.count}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
