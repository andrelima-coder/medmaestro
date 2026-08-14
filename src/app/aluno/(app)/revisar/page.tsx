import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getMinhaBancaAtiva } from '@/lib/aluno/mentoria'
import { getSrsFila } from '@/lib/aluno/srs'
import { SemMatricula } from '@/components/aluno/sem-matricula'
import { RevisarClient, type RevisarCard } from './revisar-client'

export const metadata = { title: 'Revisar — MedMaestro' }

export default async function RevisarPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/aluno/login')

  const banca = await getMinhaBancaAtiva(supabase)
  if (!banca) return <SemMatricula />

  const fila = await getSrsFila(supabase, 20)
  const questionIds = fila.map((f) => f.questionId)

  const service = createServiceClient()
  const { data: questions } = questionIds.length
    ? await service.from('questions').select('id, stem, alternatives').in('id', questionIds)
    : { data: [] as { id: string; stem: string | null; alternatives: Record<string, string> | null }[] }
  const qMap = new Map((questions ?? []).map((q) => [q.id as string, q]))

  const cards: RevisarCard[] = fila.flatMap((item) => {
    const q = qMap.get(item.questionId)
    if (!q) return []
    const alt = (q.alternatives ?? {}) as Record<string, string>
    return [
      {
        conceitoId: item.conceitoId,
        proposicao: item.proposicao,
        modulo: item.modulo,
        questionId: item.questionId,
        stem: q.stem ?? '',
        alternatives: { A: alt.A ?? '', B: alt.B ?? '', C: alt.C ?? '', D: alt.D ?? '', E: alt.E ?? '' },
      },
    ]
  })

  return <RevisarClient cards={cards} />
}
