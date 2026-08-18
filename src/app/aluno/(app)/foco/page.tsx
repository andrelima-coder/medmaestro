import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getMinhaBancaAtiva } from '@/lib/aluno/mentoria'
import { SemMatricula } from '@/components/aluno/sem-matricula'
import { FocoClient } from './foco-client'

export const metadata = { title: 'Foco — MedMaestro' }

const META_SEMANAL_PADRAO_MIN = 18 * 60

const FUSO_BR_MS = 3 * 3_600_000 // UTC-3 (sem horário de verão desde 2019)

function inicioDaSemanaIso(): string {
  const agoraBr = new Date(Date.now() - FUSO_BR_MS)
  const diasDesdeSegunda = (agoraBr.getUTCDay() + 6) % 7
  const inicioBr = Date.UTC(agoraBr.getUTCFullYear(), agoraBr.getUTCMonth(), agoraBr.getUTCDate() - diasDesdeSegunda)
  return new Date(inicioBr + FUSO_BR_MS).toISOString()
}

export default async function FocoPage() {
  const supabase = await createClient()
  const banca = await getMinhaBancaAtiva(supabase)
  if (!banca) return <SemMatricula />

  const service = createServiceClient()
  const { data: modulos } = await service
    .from('tags')
    .select('slug, label')
    .eq('dimension', 'modulo')
    .eq('is_active', true)
    .order('display_order')

  let minutosSemana = 0
  let metaSemanalMin = META_SEMANAL_PADRAO_MIN
  let focoMin = 25
  let pausaCurtaMin = 5
  let pausaLongaMin = 15
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const [{ data: sessoes }, { data: pref }] = await Promise.all([
      service
        .from('sessoes_estudo')
        .select('minutos')
        .eq('user_id', user.id)
        .gte('created_at', inicioDaSemanaIso()),
      service
        .from('mt_preferencias')
        .select('meta_foco_semanal_min, foco_min, pausa_curta_min, pausa_longa_min')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])
    minutosSemana = (sessoes ?? []).reduce((soma, s) => soma + (s.minutos ?? 0), 0)
    if (pref?.meta_foco_semanal_min) metaSemanalMin = pref.meta_foco_semanal_min
    if (pref?.foco_min) focoMin = pref.foco_min
    if (pref?.pausa_curta_min) pausaCurtaMin = pref.pausa_curta_min
    if (pref?.pausa_longa_min) pausaLongaMin = pref.pausa_longa_min
  }

  return (
    <FocoClient
      modulos={(modulos ?? []) as { slug: string; label: string }[]}
      minutosSemanaInicial={minutosSemana}
      metaSemanalMinInicial={metaSemanalMin}
      focoMin={focoMin}
      pausaCurtaMin={pausaCurtaMin}
      pausaLongaMin={pausaLongaMin}
    />
  )
}
