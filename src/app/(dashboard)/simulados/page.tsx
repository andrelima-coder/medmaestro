import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Simulados — MedMaestro' }

export default async function SimuladosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: simulados } = await service
    .from('simulados')
    .select('id, title, created_at, simulado_questions(count)')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Simulados</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {simulados?.length ?? 0} simulado{(simulados?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/simulados/novo"
          className="rounded-lg border border-[var(--mm-gold)]/30 bg-[var(--mm-gold)]/10 px-4 py-2 text-sm font-medium text-[var(--mm-gold)] hover:bg-[var(--mm-gold)]/20 transition-colors"
        >
          + Novo simulado
        </Link>
      </div>

      {!simulados || simulados.length === 0 ? (
        <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-10 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">Nenhum simulado criado ainda.</p>
          <Link
            href="/simulados/novo"
            className="text-sm text-[var(--mm-gold)] hover:underline"
          >
            Criar primeiro simulado →
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/7 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Título</th>
                <th className="px-4 py-3 font-medium">Questões</th>
                <th className="px-4 py-3 font-medium">Criado em</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {simulados.map((s) => {
                const count = (s.simulado_questions as unknown as { count: number }[])?.[0]?.count ?? 0
                const date = new Date(s.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })
                return (
                  <tr
                    key={s.id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/simulados/${s.id}`}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {s.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{count}</td>
                    <td className="px-4 py-3 text-muted-foreground">{date}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/simulados/${s.id}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Editar →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
