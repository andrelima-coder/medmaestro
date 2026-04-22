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

const STATUS_CLASSES: Record<string, string> = {
  pending_extraction: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  in_review: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  approved: 'bg-green-500/15 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
  published: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
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

  // Busca questão com exame
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

  // Tags da questão (atribuídas)
  const { data: assignedTags } = await service
    .from('question_tags')
    .select('tag_id')
    .eq('question_id', id)

  const currentTagIds = (assignedTags ?? []).map((t) => t.tag_id as string)

  // Todas as tags ativas para o painel
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

  // Comentários, imagens e revisão de tags em paralelo
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

  // Monta label do exame
  const examParts = [
    exam?.exam_boards?.short_name,
    exam?.specialties?.name,
    exam?.year,
    exam?.booklet_color
      ? exam.booklet_color.charAt(0).toUpperCase() + exam.booklet_color.slice(1)
      : null,
  ].filter(Boolean)

  const statusKey = (question.status ?? 'pending_extraction') as QuestionStatus

  return (
    <div className="aurora-bg flex flex-col gap-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/questoes"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Questões
        </Link>
        <span className="text-white/20">/</span>
        <span className="text-sm font-medium text-foreground">Q{question.question_number}</span>
        {examParts.length > 0 && (
          <>
            <span className="text-white/20">·</span>
            <span className="text-sm text-muted-foreground">{examParts.join(' · ')}</span>
          </>
        )}
      </div>

      {/* Layout side-by-side */}
      <div className="flex gap-4 items-start">
        {/* Coluna esquerda — conteúdo */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 flex flex-col gap-4">
            {/* Header da questão */}
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
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[statusKey] ?? STATUS_CLASSES.pending_extraction}`}
                >
                  {STATUS_LABELS[statusKey] ?? statusKey}
                </span>
                {(question.extraction_confidence as number | null) != null && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {question.extraction_confidence}% conf.
                  </span>
                )}
              </div>
            </div>

            {/* Enunciado */}
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {question.stem ?? '(sem enunciado)'}
            </p>

            {/* Alternativas */}
            {Object.keys(alternatives).length > 0 && (
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
                      <span
                        className={`font-semibold shrink-0 ${
                          isCorrect ? 'text-green-400' : 'text-muted-foreground'
                        }`}
                      >
                        {letter})
                      </span>
                      <span className={isCorrect ? 'text-green-300' : 'text-foreground'}>
                        {text}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Imagens da questão */}
            {images.length > 0 && <ImageModal images={images} />}
          </div>

          {/* Comentários */}
          <CommentSection questionId={id} initialComments={comments} />

          {/* Ações rápidas */}
          <div className="flex gap-3">
            {statusKey !== 'approved' && statusKey !== 'published' && (
              <Link
                href={`/revisao/${question.id}`}
                className="rounded-lg border border-white/8 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
              >
                Abrir na revisão →
              </Link>
            )}
          </div>
        </div>

        {/* Coluna direita — tags + metadata */}
        <div className="w-72 shrink-0 flex flex-col gap-4">
          {/* Metadata card */}
          <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-4 flex flex-col gap-2.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Exame
            </h3>
            {exam ? (
              <dl className="flex flex-col gap-1.5 text-xs">
                {exam.exam_boards && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Banca</dt>
                    <dd className="text-foreground">{exam.exam_boards.short_name}</dd>
                  </div>
                )}
                {exam.specialties && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Especialidade</dt>
                    <dd className="text-foreground text-right">{exam.specialties.name}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ano</dt>
                  <dd className="text-foreground">{exam.year}</dd>
                </div>
                {exam.booklet_color && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Cor</dt>
                    <dd className="text-foreground capitalize">{exam.booklet_color}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground">Sem exame vinculado</p>
            )}
          </div>

          {/* Tag panel com autosave */}
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
