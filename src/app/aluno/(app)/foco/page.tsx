import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getMinhaBancaAtiva } from '@/lib/aluno/mentoria'
import { SemMatricula } from '@/components/aluno/sem-matricula'
import { FocoClient } from './foco-client'

export const metadata = { title: 'Foco — MedMaestro' }

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

  return <FocoClient modulos={(modulos ?? []) as { slug: string; label: string }[]} />
}
