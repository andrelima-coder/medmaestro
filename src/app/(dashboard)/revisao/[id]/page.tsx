import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AssignmentBar } from '@/components/revisao/assignment-bar'
import { ActionsPanel } from '@/components/revisao/actions-panel'
import { QuestionEditor } from '@/components/revisao/question-editor'
import { TagPanel, type TagItem } from '@/components/questoes/tag-panel'
import { CommentList } from '@/components/revisao/comment-list'
import { ImageModal } from '@/components/questoes/image-modal'
import { getQuestionComments } from '@/app/(dashboard)/questoes/[id]/comment-actions'
import { getQuestionImages } from '@/app/(dashboard)/questoes/[id]/image-actions'
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Badge,
  LockBanner,
} from '@/components/ui'

export const metadata = { title: 'Revisão — MedMaestro' }

const TEN_MINUTES_MS = 10 * 60 * 1000

const STATUS_LABELS: Record<string, string> = {
  extracted: 'Extraída',
  reviewing: 'Em revisão',
  flagged: 'Sinalizada',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  commented: 'Comentada',
  published: 'Publicada',
  draft: 'Rascunho',
}

type BadgeTone = 'green' | 'gold' | 'red' | 'blue' | 'muted' | 'orange' | 'purple'

const STATUS_TONE: Record<string, BadgeTone> = {
  extracted: 'blue',
  reviewing: 'purple',
  flagged: 'orange',
  approved: 'green',
  rejected: 'red',
  commented: 'purple',
  published: 'green',
  draft: 'muted',
}

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

  const [questionRes, assignedTagsRes, allTagsRawRes, lastTagRevRes, comments, images] =
    await Promise.all([
      service
        .from('questions')
        .select(
          'id, question_number, stem, stem_html, alternatives, alternatives_html, status, has_images, extraction_confidence, correct_answer, exam_id, exams(year, booklet_color, specialties(name, exam_boards(name)))'
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
        .select('id, change_reason')
        .eq('question_id', id)
        .in('change_reason', ['tag_update', 'content_edit'])
        .order('revision_number', { ascending: false })
        .limit(1)
        .maybeSingle(),
      getQuestionComments(id),
      getQuestionImages(id),
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

  const alternativesHtml =
    (question.alternatives_html as Record<'A' | 'B' | 'C' | 'D' | 'E', string> | null) ?? {}
  const stemHtml = (question.stem_html as string | null) ?? ''

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
      .update({ status: 'reviewing', updated_at: now.toISOString() })
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

  const Breadcrumb = (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <Link
        href="/revisao"
        className="text-[var(--mm-muted)] no-underline transition-colors hover:text-foreground"
      >
        ← Fila
      </Link>
      <span className="text-[var(--mm-muted)]">/</span>
      <span className="font-medium text-foreground">
        Q{question.question_number as number}
      </span>
      {examLabel && (
        <>
          <span className="text-[var(--mm-muted)]">·</span>
          <span className="text-[var(--mm-muted)]">{examLabel}</span>
        </>
      )}
    </div>
  )

  if (lockedByOther) {
    return (
      <div className="flex flex-col gap-6">
        {Breadcrumb}
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-[var(--mm-warning)]">
            <span
              aria-hidden
              className="inline-block size-2 rounded-full bg-[var(--mm-warning)]"
            />
            <span>
              Esta questão está sendo revisada por <strong>{lockedByName}</strong>. Aguarde
              ou escolha outra.
            </span>
          </CardBody>
        </Card>
      </div>
    )
  }

  const statusKey = (question.status as string) ?? 'extracted'
  const statusTone = STATUS_TONE[statusKey] ?? 'blue'

  return (
    <div className="flex flex-col gap-4">
      {Breadcrumb}

      <LockBanner>
        Em revisão por <strong className="font-semibold">{reviewerName}</strong> · Bloqueado
        por 10 minutos
      </LockBanner>

      <AssignmentBar questionId={id} reviewerName={reviewerName} expiresAt={expiresAt} />

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        {/* Esquerdo: conteúdo da questão */}
        <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                Q{question.question_number as number}
                {exam?.year ? ` / ${exam.year}` : ''}
              </CardTitle>
              <div className="flex shrink-0 items-center gap-2">
                {(question.has_images as boolean | null) && (
                  <Badge tone="purple">Imagem</Badge>
                )}
                <Badge tone={statusTone}>
                  {STATUS_LABELS[statusKey] ?? statusKey}
                </Badge>
                {(question.extraction_confidence as number | null) !== null && (
                  <span className="text-xs tabular-nums text-[var(--mm-muted)]">
                    {(question.extraction_confidence as number) * 20}% confiança
                  </span>
                )}
              </div>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <QuestionEditor
                questionId={id}
                initialStemHtml={stemHtml || (question.stem as string | null) || ''}
                initialAlternativesHtml={alternativesHtml}
                correctAnswer={(question.correct_answer as string | null) ?? null}
                hasUndoableEdit={hasUndoableRevision}
              />

              {images.length > 0 && <ImageModal images={images} />}

              {/* Aviso quando gabarito não disponível */}
              {!(question.correct_answer as string | null) && (
                <p className="text-[11px] italic text-[var(--mm-muted)]">
                  Gabarito ainda não sincronizado — faça o upload do PDF do gabarito no
                  lote.
                </p>
              )}
            </CardBody>
          </Card>

          <CommentList comments={comments} />
        </div>

        {/* Direito: ações + tags */}
        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[300px]">
          <ActionsPanel questionId={id} currentStatus={statusKey} userId={user.id} />

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
