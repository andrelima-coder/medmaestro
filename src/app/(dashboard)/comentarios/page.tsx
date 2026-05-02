import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listExamsForFilter, listQuestionsForComments } from './actions'
import { ComentariosClient } from './comentarios-client'

export const metadata = { title: 'Comentários — MedMaestro' }

export default async function ComentariosPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; only_pending?: string; low_conf?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const filter = {
    examId: sp.exam || undefined,
    withoutCommentOnly: sp.only_pending === '1',
    lowConfidenceOnly: sp.low_conf === '1',
  }

  const [exams, rows] = await Promise.all([
    listExamsForFilter(),
    listQuestionsForComments(filter),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-syne)] text-xl font-bold text-foreground">
          Comentários
        </h1>
        <p className="mt-1 text-[13px] text-[var(--mm-muted)]">
          Gere comentários didáticos por IA em lote para questões selecionadas
        </p>
      </div>

      <ComentariosClient
        rows={rows}
        exams={exams}
        initialFilter={{
          examId: filter.examId ?? '',
          onlyPending: filter.withoutCommentOnly,
          lowConf: filter.lowConfidenceOnly,
        }}
      />
    </div>
  )
}
