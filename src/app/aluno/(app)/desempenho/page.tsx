import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getModuleStats,
  getTimelineAndAccess,
  resumoFromModules,
} from '@/lib/analytics/desempenho'
import { DesempenhoClient } from './desempenho-client'

export const metadata = { title: 'Meu desempenho — MedMaestro' }

function Aviso({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-8 text-center">
      <h1 className="text-lg font-bold text-foreground">{title}</h1>
      <div className="mt-2 text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

export default async function DesempenhoPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/aluno/login')

  const { timeline, hasDashboardAccess } = await getTimelineAndAccess(supabase, user.id)
  if (!hasDashboardAccess) {
    return (
      <Aviso title="Desempenho ainda não liberado">
        O painel de desempenho será liberado pela organização. Fique atento ao e-mail e à live de correção.
      </Aviso>
    )
  }

  const modulos = await getModuleStats(supabase, user.id, 'modulo')
  const edital = await getModuleStats(supabase, user.id, 'topico_edital')
  const resumo = resumoFromModules(modulos)

  if (resumo.totalRespondidas === 0) {
    return (
      <Aviso title="Sem dados ainda">
        Assim que suas provas com gabarito liberado forem processadas, seu desempenho aparecerá aqui.
      </Aviso>
    )
  }

  return (
    <DesempenhoClient modulos={modulos} edital={edital} timeline={timeline} resumo={resumo} />
  )
}
