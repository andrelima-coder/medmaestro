import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AssignmentBar } from '@/components/revisao/assignment-bar'
import { ActionsPanel } from '@/components/revisao/actions-panel'
import { TagPanel, type TagItem } from '@/components/questoes/tag-panel'
import { CommentList } from '@/components/revisao/comment-list'
import { getQuestionComments } from '@/app/(dashboard)/questoes/[id]/comment-actions'

export const metadata = { title: 'Revisão — MedMaestro' }

const TEN_MINUTES_MS = 10 * 60 * 1000

const STATUS_LABELS: Record<string, string> = {
  pending_extraction: 'Aguardando extração',
  pending_review: 'Aguardando revisão',
  in_review: 'Em revisão',
  needs_attention: 'Atenção',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  published: 'Publicada',
  error: 'Erro',
}

const STATUS_CLASSES: Record<string, string> = {
  pending_extraction: 'border-blue-500/30 bg-blue-500/15 text-blue-400',
  pending_review: 'border-yellow-500/30 bg-yellow-500/15 text-yellow-400',
  in_review: 'border-purple-500/30 bg-purple-500/15 text-purple-400',
  needs_attention: 'border-orange-500/30 bg-orange-500/15 text-orange-400',
  approved: 'border-green-500/30 bg-green-500/15 text-green-400',
  rejected: 'border-red-500/30 bg-red-500/15 text-red-400',
  published: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
  error: 'border-red-500/30 bg-red-500/15 text-red-400',
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

  // Busca questão + dados de tags + revisões + comentários em paralelo
  const [questionRes, assignedTagsRes, allTagsRawRes, lastTagRevRes, comments] = await Promise.all([
    service
      .from('questions')
      .select(
        'id, question_number, stem, alternatives, status, has_images, extraction_confidence, correct_answer, exam_id, exams(year, booklet_color, specialties(name, exam_boards(name)))'
      )
      .eq('id', id)
      .single(),
    service.from('question_tags').select('tag_id').eq('question_id', id),
    service
      .from('tags')
      .select('id, label, color, dimension, display_order')
      .eq('is_active', true)
      .order('dimension')
      .order('display_order')
      .order('label'),
    service
      .from('question_revisions')
      .select('id')
      .eq('question_id', id)
      .eq('change_reason', 'tag_update')
      .limit(1)
      .single(),
    getQuestionComments(id),
  ])

  const question = questionRes.data
  if (!question) notFound()

  const currentTagIds = (assignedTagsRes.data ?? []).map((t) => t.tag_id as string)
  const allTags: TagItem[] = (allTagsRawRes.data ?? []).map((t) => ({
    id: t.id as string,
    label: t.label as string,
    color: t.color as string | null,
    dimension: t.dimension as string,
  }))
  const hasUndoableRevision = !!lastTagRevRes.data

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
  const examLabel = [
    boardName,
    specialtyName,
    exam?.year,
    exam?.booklet_color
      ? exam.booklet_color.charAt(0).toUpperCase() + exam.booklet_color.slice(1)
      : '',
  ]
    .filter(Boolean)
    .join(' · ')

  if (lockedByOther) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Link
            href="/revisao"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Fila
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-sm font-medium text-foreground">Q{question.question_number}</span>
        </div>
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-sm text-yellow-400">
          Esta questão está sendo revisada por <strong>{lockedByName}</strong>. Aguarde ou escolha
          outra.
        </div>
      </div>
    )
  }

  const statusKey = (question.status as string) ?? 'pending_review'

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/revisao"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Fila
        </Link>
        <span className="text-white/20">/</span>
        <span className="text-sm font-medium text-foreground">Q{question.question_number}</span>
        <span className="text-white/20">·</span>
        <span className="text-sm text-muted-foreground">{examLabel}</span>
      </div>

      <AssignmentBar questionId={id} reviewerName={reviewerName} expiresAt={expiresAt} />

      <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 200px)', alignItems: 'flex-start' }}>
        {/* ── Esquerdo: conteúdo da questão ── */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)] p-6 flex flex-col gap-4">
            {/* Header da questão */}
            <div className="flex items-start justify-between gap-4">
              <h2
                className="font-[family-name:var(--font-syne)]"
                style={{ fontSize: 15, fontWeight: 700, color: 'var(--mm-text)' }}
              >
                Questão {question.question_number as number}
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                {(question.has_images as boolean | null) && (
                  <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-400">
                    Imagem
                  </span>
                )}
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[statusKey] ?? STATUS_CLASSES.pending_review}`}
                >
                  {STATUS_LABELS[statusKey] ?? statusKey}
                </span>
                {(question.extraction_confidence as number | null) !== null && (
                  <span className="text-xs tabular-nums" style={{ color: 'var(--mm-muted)' }}>
                    {(question.extraction_confidence as number) * 20}% confiança
                  </span>
                )}
              </div>
            </div>

            {/* Enunciado */}
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--mm-text)' }}>
              {(question.stem as string | null) ?? '(sem enunciado)'}
            </p>

            {/* Alternativas */}
            <div className="flex flex-col gap-2 mt-2">
              {LETTERS.map((letter) => {
                const text = alternatives[letter]
                if (!text) return null
                const isCorrect = question.correct_answer === letter
                return (
                  <div
                    key={letter}
                    style={{
                      display: 'flex',
                      gap: 12,
                      borderRadius: 8,
                      border: isCorrect
                        ? '1px solid rgba(102,187,106,0.3)'
                        : '1px solid rgba(255,255,255,0.05)',
                      background: isCorrect ? 'rgba(102,187,106,0.08)' : 'rgba(255,255,255,0.02)',
                      padding: '10px 14px',
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        flexShrink: 0,
                        color: isCorrect ? '#66BB6A' : 'var(--mm-muted)',
                      }}
                    >
                      {letter})
                    </span>
                    <span style={{ color: isCorrect ? '#66BB6A' : 'var(--mm-text)' }}>{text}</span>
                  </div>
                )
              })}
            </div>

            {/* Aviso quando gabarito não disponível */}
            {!(question.correct_answer as string | null) && (
              <p
                style={{
                  fontSize: 11,
                  color: 'var(--mm-muted)',
                  marginTop: 4,
                  fontStyle: 'italic',
                }}
              >
                Gabarito ainda não sincronizado — faça o upload do PDF do gabarito no lote.
              </p>
            )}
          </div>

          <CommentList comments={comments} />
        </div>

        {/* ── Direito: ações + tags ── */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <ActionsPanel
            questionId={id}
            currentStatus={statusKey}
            userId={user.id}
          />

          {/* TagPanel inline — classifica enquanto revisa */}
          <TagPanel
            key={currentTagIds.sort().join(',')}
            questionId={id}
            allTags={allTags}
            currentTagIds={currentTagIds}
            hasUndoableRevision={hasUndoableRevision}
          />
        </div>
      </div>
    </div>
  )
}
