import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AssignmentBar } from '@/components/revisao/assignment-bar'
import { ActionsPanel } from '@/components/revisao/actions-panel'

export const metadata = { title: 'Revisão — MedMaestro' }

const TEN_MINUTES_MS = 10 * 60 * 1000

const STATUS_LABELS: Record<string, string> = {
  pending_extraction: 'Aguardando',
  in_review: 'Em revisão',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  published: 'Publicada',
}

const STATUS_CLASSES: Record<string, string> = {
  pending_extraction: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  in_review: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  approved: 'bg-green-500/15 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
  published: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

export default async function RevisaoItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const service = createServiceClient()

  const { data: question } = await service
    .from('questions')
    .select(
      'id, question_number, stem, alternatives, status, has_images, extraction_confidence, correct_answer, exam_id, exams(year, booklet_color, specialties(name, exam_boards(name)))'
    )
    .eq('id', id)
    .single()

  if (!question) notFound()

  const exam = question.exams as unknown as {
    year: number
    booklet_color: string | null
    specialties: { name: string; exam_boards: { name: string } | null } | null
  } | null

  const alternatives = (question.alternatives as Record<string, string> | null) ?? {}

  const now = new Date()

  const { data: assignment } = await service
    .from('review_assignments')
    .select('id, assigned_to, expires_at, status')
    .eq('question_id', id)
    .single()

  const assignmentExpired = !assignment || new Date(assignment.expires_at) <= now
  const lockedByOther =
    !assignmentExpired &&
    assignment.status === 'in_progress' &&
    assignment.assigned_to !== user.id

  let lockedByName = ''
  if (lockedByOther) {
    const { data: lockerProfile } = await service
      .from('profiles')
      .select('full_name')
      .eq('id', assignment.assigned_to)
      .single()
    lockedByName = lockerProfile?.full_name ?? 'outro revisor'
  }

  let expiresAt = assignment?.expires_at ?? ''
  if (!lockedByOther) {
    const newExpiresAt = new Date(now.getTime() + TEN_MINUTES_MS).toISOString()
    await service.from('review_assignments').upsert(
      {
        question_id: id,
        assigned_to: user.id,
        status: 'in_progress',
        assigned_at: now.toISOString(),
        expires_at: newExpiresAt,
      },
      { onConflict: 'question_id' }
    )
    await service
      .from('questions')
      .update({ status: 'in_review', updated_at: now.toISOString() })
      .eq('id', id)
    expiresAt = newExpiresAt
  }

  const { data: myProfile } = await service
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()
  const reviewerName = myProfile?.full_name ?? user.email ?? 'Você'

  const boardName = exam?.specialties?.exam_boards?.name ?? ''
  const specialtyName = exam?.specialties?.name ?? ''
  const examLabel = [boardName, specialtyName, exam?.year, exam?.booklet_color ? exam.booklet_color.charAt(0).toUpperCase() + exam.booklet_color.slice(1) : '']
    .filter(Boolean)
    .join(' · ')

  if (lockedByOther) {
    return (
      <div className="aurora-bg flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Link href="/revisao" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Fila
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-sm font-medium text-foreground">Q{question.question_number}</span>
        </div>
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-sm text-yellow-400">
          Esta questão está sendo revisada por <strong>{lockedByName}</strong>. Aguarde ou escolha outra.
        </div>
      </div>
    )
  }

  return (
    <div className="aurora-bg flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/revisao" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Fila
        </Link>
        <span className="text-white/20">/</span>
        <span className="text-sm font-medium text-foreground">Q{question.question_number}</span>
        <span className="text-white/20">·</span>
        <span className="text-sm text-muted-foreground">{examLabel}</span>
      </div>

      <AssignmentBar
        questionId={id}
        reviewerName={reviewerName}
        expiresAt={expiresAt}
      />

      <div className="flex gap-4 min-h-[calc(100vh-200px)]">
        {/* Painel esquerdo — conteúdo da questão */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-base font-semibold text-foreground">
                Questão {question.question_number}
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                {(question.has_images as boolean | null) && (
                  <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-400">
                    Imagem
                  </span>
                )}
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[question.status ?? 'pending_extraction'] ?? STATUS_CLASSES.pending_extraction}`}>
                  {STATUS_LABELS[question.status ?? 'pending_extraction'] ?? question.status}
                </span>
                {(question.extraction_confidence as number | null) !== null && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {question.extraction_confidence}% confiança
                  </span>
                )}
              </div>
            </div>

            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {question.stem ?? '(sem enunciado)'}
            </p>

            <div className="flex flex-col gap-2 mt-2">
              {LETTERS.map((letter) => {
                const text = alternatives[letter]
                if (!text) return null
                const isCorrect = question.correct_answer === letter
                return (
                  <div
                    key={letter}
                    className={`flex gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                      isCorrect
                        ? 'border-green-500/30 bg-green-500/10'
                        : 'border-white/5 bg-white/2'
                    }`}
                  >
                    <span className={`font-semibold shrink-0 ${isCorrect ? 'text-green-400' : 'text-muted-foreground'}`}>
                      {letter})
                    </span>
                    <span className={isCorrect ? 'text-green-300' : 'text-foreground'}>{text}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Painel direito — ações */}
        <div className="w-72 shrink-0 flex flex-col gap-4">
          <ActionsPanel
            questionId={id}
            currentStatus={question.status ?? 'pending_extraction'}
            userId={user.id}
          />
        </div>
      </div>
    </div>
  )
}
