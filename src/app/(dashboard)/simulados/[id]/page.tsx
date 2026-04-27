import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { SimuladoTitle } from '@/components/simulados/simulado-title'
import { SimuladoDelete } from '@/components/simulados/simulado-delete'
import { QuestionPicker } from '@/components/simulados/question-picker'
import { SimuladoQuestionList } from '@/components/simulados/question-list'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const service = createServiceClient()
  const { data } = await service.from('simulados').select('title').eq('id', id).single()
  return { title: `${data?.title ?? 'Simulado'} — MedMaestro` }
}

export default async function SimuladoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: simulado } = await service
    .from('simulados')
    .select('id, title, created_by, created_at')
    .eq('id', id)
    .single()

  if (!simulado) notFound()

  const isOwner = simulado.created_by === user.id

  const { data: sqRows } = await service
    .from('simulado_questions')
    .select(
      'id, position, note, question_id, questions!inner(id, question_number, stem, correct_answer, exams!left(year, booklet_color, exam_boards(short_name)))'
    )
    .eq('simulado_id', id)
    .order('position', { ascending: true })

  const questions = (sqRows ?? []).map((row) => {
    const q = row.questions as unknown as {
      id: string
      question_number: number
      stem: string
      correct_answer: string | null
      exams: {
        year: number
        booklet_color: string | null
        exam_boards: { short_name: string } | null
      } | null
    }
    const exam = q.exams
    const examLabel = [exam?.exam_boards?.short_name, exam?.year].filter(Boolean).join(' ')
    return {
      sqId: row.id as string,
      position: row.position as number,
      note: row.note as string | null,
      questionId: row.question_id as string,
      questionNumber: q.question_number,
      stem: q.stem,
      examLabel,
    }
  })

  const addedIds = questions.map((q) => q.questionId)

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/simulados"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Simulados
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          {isOwner ? (
            <SimuladoTitle simuladoId={id} initialTitle={simulado.title} />
          ) : (
            <h1 className="text-xl font-semibold text-foreground">{simulado.title}</h1>
          )}
          <p className="text-sm text-muted-foreground">
            {questions.length} questão{questions.length !== 1 ? 'ões' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {questions.length > 0 && (
            <a
              href={`/api/simulados/${id}/export`}
              download
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-xs text-foreground"
            >
              ↓ Exportar Word
            </a>
          )}
          {isOwner && <SimuladoDelete simuladoId={id} />}
        </div>
      </div>

      <div className="flex gap-6 items-start">
        {/* Questões do simulado */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">Questões</h2>

          {isOwner ? (
            <SimuladoQuestionList simuladoId={id} initialQuestions={questions} />
          ) : questions.length === 0 ? (
            <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-8 text-center text-sm text-muted-foreground">
              Nenhuma questão adicionada.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {questions.map((q, i) => (
                <div
                  key={q.sqId}
                  className="rounded-xl border border-white/5 bg-[var(--mm-surface)]/40 px-4 py-3 flex flex-col gap-2"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xs tabular-nums text-muted-foreground/50 shrink-0 w-5 pt-0.5">
                      {i + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Q{q.questionNumber}
                        {q.examLabel ? ` · ${q.examLabel}` : ''}
                      </p>
                      <p className="text-sm text-foreground mt-0.5 line-clamp-2">{q.stem}</p>
                    </div>
                    <Link
                      href={`/questoes/${q.questionId}`}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      Ver
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Seletor de questões */}
        {isOwner && (
          <div className="w-80 shrink-0 flex flex-col gap-3">
            <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-4 flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">Adicionar questões</h3>
              <QuestionPicker simuladoId={id} initialAddedIds={addedIds} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
