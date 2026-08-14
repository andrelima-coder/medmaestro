import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getMinhaBancaAtiva } from '@/lib/aluno/mentoria'
import { SemMatricula } from '@/components/aluno/sem-matricula'
import { AgendaClient, type AgendaBloco, type AgendaNota } from './agenda-client'

export const metadata = { title: 'Agenda — MedMaestro' }

export default async function AgendaPage() {
  const supabase = await createClient()
  const banca = await getMinhaBancaAtiva(supabase)
  if (!banca) return <SemMatricula />

  const service = createServiceClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: blocos }, { data: notas }] = await Promise.all([
    service
      .from('mt_agenda_blocos')
      .select('id, titulo, dia_semana, hora_inicio, hora_fim, cor')
      .eq('user_id', user!.id)
      .eq('ativo', true)
      .order('dia_semana')
      .order('hora_inicio'),
    service
      .from('mt_anotacoes')
      .select('id, texto, created_at')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return (
    <AgendaClient
      initialBlocos={(blocos ?? []) as AgendaBloco[]}
      initialNotas={(notas ?? []) as AgendaNota[]}
    />
  )
}
