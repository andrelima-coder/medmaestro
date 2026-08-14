import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSimuladosDisponiveis, getMeusSimulados } from '@/lib/aluno/estudo'

export const metadata = { title: 'Simulados — MedMaestro' }

const STATUS_LABEL: Record<string, string> = {
  em_andamento: 'Em andamento',
  entregue: 'Concluído',
  expirado: 'Expirado',
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default async function SimuladosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/aluno/login')

  const service = createServiceClient()
  const [disponiveis, meus] = await Promise.all([
    getSimuladosDisponiveis(service),
    getMeusSimulados(service, user.id),
  ])

  // Prova é tentativa única: campanhas já entregues/expiradas saem daqui e
  // aparecem só no histórico abaixo.
  const finalizados = new Set(meus.filter((m) => m.status !== 'em_andamento').map((m) => m.campaignId))
  const emAndamento = new Set(meus.filter((m) => m.status === 'em_andamento').map((m) => m.campaignId))
  const paraFazer = disponiveis.filter((c) => !finalizados.has(c.campaignId))

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground">Simulados</h1>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-base font-bold text-foreground">Disponíveis agora</h2>
        {paraFazer.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhum simulado aberto no momento.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {paraFazer.map((c) => (
              <div
                key={c.campaignId}
                className="flex items-center justify-between rounded-xl bg-muted/40 p-4"
              >
                <div>
                  <div className="font-semibold text-foreground">{c.nome}</div>
                  {c.totalQuestoes && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{c.totalQuestoes} questões</div>
                  )}
                </div>
                <Link
                  href={`/aluno/simulado/${c.campaignId}`}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  {emAndamento.has(c.campaignId) ? 'Continuar' : 'Iniciar'}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-base font-bold text-foreground">Meu histórico</h2>
        {meus.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Você ainda não fez nenhum simulado.</p>
        ) : (
          <div className="mt-3 flex flex-col">
            {meus.map((m) => (
              <div
                key={m.campaignId}
                className="flex items-center justify-between border-b border-border py-3 last:border-b-0"
              >
                <div>
                  <div className="font-semibold text-foreground">{m.nome}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {STATUS_LABEL[m.status]} · {fmt(m.startedAt)}
                  </div>
                </div>
                {m.status === 'entregue' ? (
                  <Link
                    href={`/aluno/simulado/${m.campaignId}/resultado`}
                    className="text-sm font-semibold text-primary"
                  >
                    Ver resultado
                  </Link>
                ) : m.status === 'em_andamento' ? (
                  <Link href={`/aluno/simulado/${m.campaignId}`} className="text-sm font-semibold text-primary">
                    Continuar
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
