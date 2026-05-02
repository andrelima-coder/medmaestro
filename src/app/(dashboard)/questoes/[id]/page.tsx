import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { TagPanel } from '@/components/questoes/tag-panel'
import type { TagItem } from '@/components/questoes/tag-panel'
import { CommentSection } from '@/components/questoes/comment-section'
import { ImageModal } from '@/components/questoes/image-modal'
import { getQuestionComments } from './comment-actions'
import { getQuestionImages } from './image-actions'
import { STATUS_LABELS } from '@/types'
import type { QuestionStatus } from '@/types'
import { Card, CardBody, CardHeader, CardTitle, Badge, AltCard } from '@/components/ui'

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

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const service = createServiceClient()
  const { data } = await service
    .from('questions')
    .select('question_number')
    .eq('id', id)
    .single()
  return { title: `Q${data?.question_number ?? '?'} — MedMaestro` }
}

export default async function QuestaoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const service = createServiceClient()

  const { data: question } = await service
    .from('questions')
    .select(
      'id, question_number, stem, alternatives, correct_answer, status, has_images, extraction_confidence, exam_id, exams!left(year, booklet_color, exam_boards(short_name, slug), specialties(name))'
    )
    .eq('id', id)
    .single()

  if (!question) notFound()

  const exam = question.exams as unknown as {
    year: number
    booklet_color: string | null
    exam_boards: { short_name: string; slug: string } | null
    specialties: { name: string } | null
  } | null

  const alternatives = (question.alternatives as Record<string, string> | null) ?? {}

  const { data: assignedTags } = await service
    .from('question_tags')
    .select('tag_id')
    .eq('question_id', id)

  const currentTagIds = (assignedTags ?? []).map((t) => t.tag_id as string)

  const { data: allTagsRaw } = await service
    .from('tags')
    .select('id, label, color, dimension, display_order')
    .eq('is_active', true)
    .order('dimension')
    .order('display_order')
    .order('label')

  const allTags: TagItem[] = (allTagsRaw ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    color: t.color,
    dimension: t.dimension,
  }))

  const [comments, images, lastTagRevResult] = await Promise.all([
    getQuestionComments(id),
    getQuestionImages(id),
    service
      .from('question_revisions')
      .select('id')
      .eq('question_id', id)
      .eq('change_reason', 'tag_update')
      .limit(1)
      .single(),
  ])

  const hasUndoableRevision = !!lastTagRevResult.data

  const examParts = [
    exam?.exam_boards?.short_name,
    exam?.specialties?.name,
    exam?.year,
    exam?.booklet_color
      ? exam.booklet_color.charAt(0).toUpperCase() + exam.booklet_color.slice(1)
      : null,
  ].filter(Boolean)

  const statusKey = (question.status ?? 'extracted') as QuestionStatus
  const statusTone = STATUS_TONE[statusKey] ?? 'blue'

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Link
          href="/questoes"
          className="text-[var(--mm-muted)] no-underline transition-colors hover:text-foreground"
        >
          Questões
        </Link>
        <span className="text-[var(--mm-muted)]">/</span>
        <span className="font-medium text-foreground">
          Q{question.question_number as number}
        </span>
        {examParts.length > 0 && (
          <>
            <span className="text-[var(--mm-muted)]">·</span>
            <span className="text-[var(--mm-muted)]">{examParts.join(' · ')}</span>
          </>
        )}
      </div>

      {/* Layout side-by-side */}
      <div className="flex flex-col items-start gap-4 lg:flex-row">
        {/* Coluna esquerda — conteúdo */}
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
                {(question.extraction_confidence as number | null) != null && (
                  <span className="text-xs tabular-nums text-[var(--mm-muted)]">
                    {question.extraction_confidence}% conf.
                  </span>
                )}
              </div>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              {/* Enunciado */}
              <p className="whitespace-pre-wrap text-[14px] leading-[1.8] text-foreground">
                {question.stem ?? '(sem enunciado)'}
              </p>

              {/* Alternativas */}
              {Object.keys(alternatives).length > 0 && (
                <div className="flex flex-col gap-0">
                  {LETTERS.map((letter) => {
                    const text = alternatives[letter]
                    if (!text) return null
                    const isCorrect = question.correct_answer === letter
                    return (
                      <AltCard key={letter} letter={letter} correct={isCorrect}>
                        {text}
                      </AltCard>
                    )
                  })}
                </div>
              )}

              {/* Imagens da questão */}
              {images.length > 0 && <ImageModal images={images} />}
            </CardBody>
          </Card>

          {/* Comentários */}
          <CommentSection questionId={id} initialComments={comments} />

          {/* Ações rápidas */}
          {statusKey !== 'approved' && statusKey !== 'published' && (
            <div className="flex gap-2">
              <Link
                href={`/revisao/${question.id}`}
                className="rounded-lg border border-[var(--mm-border-default)] bg-transparent px-3.5 py-2 text-xs text-[var(--mm-text2)] no-underline transition-colors hover:border-[var(--mm-border-hover)] hover:text-foreground"
              >
                Abrir na revisão →
              </Link>
            </div>
          )}
        </div>

        {/* Coluna direita — exame + tags */}
        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-72">
          {/* Metadata card */}
          <Card>
            <CardHeader>
              <CardTitle>Exame</CardTitle>
            </CardHeader>
            <CardBody>
              {exam ? (
                <dl className="flex flex-col gap-2 text-xs">
                  {exam.exam_boards && (
                    <div className="flex justify-between">
                      <dt className="text-[var(--mm-muted)]">Banca</dt>
                      <dd className="text-foreground">{exam.exam_boards.short_name}</dd>
                    </div>
                  )}
                  {exam.specialties && (
                    <div className="flex justify-between">
                      <dt className="text-[var(--mm-muted)]">Especialidade</dt>
                      <dd className="text-right text-foreground">{exam.specialties.name}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-[var(--mm-muted)]">Ano</dt>
                    <dd className="text-foreground">{exam.year}</dd>
                  </div>
                  {exam.booklet_color && (
                    <div className="flex justify-between">
                      <dt className="text-[var(--mm-muted)]">Cor</dt>
                      <dd className="capitalize text-foreground">{exam.booklet_color}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-xs text-[var(--mm-muted)]">Sem exame vinculado</p>
              )}
            </CardBody>
          </Card>

          {/* Tag panel com autosave (client) */}
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
