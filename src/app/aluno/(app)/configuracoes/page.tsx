import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getMinhaBancaAtiva } from '@/lib/aluno/mentoria'
import { ConfiguracoesClient } from './configuracoes-client'

export const metadata = { title: 'Configurações — MedMaestro' }

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let nome = ''
  let email = ''
  let bancaLabel: string | null = null
  let dailyGoal = 10
  let metaFocoMin = 18 * 60
  let focoMin = 25
  let pausaCurtaMin = 5
  let pausaLongaMin = 15

  if (user) {
    email = user.email ?? ''
    const service = createServiceClient()
    const [{ data: profile }, { data: goal }, { data: pref }, banca] = await Promise.all([
      service.from('profiles').select('full_name').eq('id', user.id).single(),
      service.from('student_goals').select('daily_goal').eq('user_id', user.id).maybeSingle(),
      service
        .from('mt_preferencias')
        .select('meta_foco_semanal_min, foco_min, pausa_curta_min, pausa_longa_min')
        .eq('user_id', user.id)
        .maybeSingle(),
      getMinhaBancaAtiva(supabase),
    ])
    nome = profile?.full_name ?? ''
    if (goal?.daily_goal) dailyGoal = goal.daily_goal
    if (pref?.meta_foco_semanal_min) metaFocoMin = pref.meta_foco_semanal_min
    if (pref?.foco_min) focoMin = pref.foco_min
    if (pref?.pausa_curta_min) pausaCurtaMin = pref.pausa_curta_min
    if (pref?.pausa_longa_min) pausaLongaMin = pref.pausa_longa_min
    if (banca) bancaLabel = banca.nomeCurto
  }

  return (
    <ConfiguracoesClient
      nomeInicial={nome}
      email={email}
      bancaLabel={bancaLabel}
      dailyGoalInicial={dailyGoal}
      metaFocoMinInicial={metaFocoMin}
      focoMinInicial={focoMin}
      pausaCurtaMinInicial={pausaCurtaMin}
      pausaLongaMinInicial={pausaLongaMin}
    />
  )
}
