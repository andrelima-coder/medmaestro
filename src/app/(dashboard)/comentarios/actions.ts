'use server'

import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateComment } from '@/lib/extraction/pipeline'
import { logAudit } from '@/lib/audit'

const BATCH_CONCURRENCY = 3

export type GenerateCommentsResult = {
  ok: boolean
  queued?: number
  error?: string
}

export async function generateCommentsBatchAction(
  questionIds: string[]
): Promise<GenerateCommentsResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (questionIds.length === 0) {
    return { ok: false, error: 'Nenhuma questão selecionada' }
  }

  const ids = [...new Set(questionIds)]

  await logAudit(user.id, 'question', ids[0], 'comments_batch_triggered', null, {
    count: ids.length,
    triggered_by: user.id,
  })

  after(async () => {
    for (let i = 0; i < ids.length; i += BATCH_CONCURRENCY) {
      const batch = ids.slice(i, i + BATCH_CONCURRENCY)
      await Promise.allSettled(batch.map((id) => generateComment(id)))
    }
  })

  return { ok: true, queued: ids.length }
}

export type CommentRow = {
  id: string
  question_number: number
  stem: string
  exam_id: string
  exam_label: string
  has_comment: boolean
  extraction_confidence: number | null
}

export async function listQuestionsForComments(filter: {
  examId?: string
  withoutCommentOnly?: boolean
  lowConfidenceOnly?: boolean
}): Promise<CommentRow[]> {
  const supabase = createServiceClient()

  let query = supabase
    .from('questions')
    .select(
      'id, question_number, stem, exam_id, extraction_confidence, exams!inner(year, booklet_color, specialties(name))'
    )
    .order('exam_id', { ascending: false })
    .order('question_number', { ascending: true })
    .limit(500)

  if (filter.examId) query = query.eq('exam_id', filter.examId)
  if (filter.lowConfidenceOnly) query = query.lte('extraction_confidence', 2)

  const { data: rows } = await query
  if (!rows) return []

  const ids = rows.map((r) => r.id as string)
  const { data: existingComments } = await supabase
    .from('question_comments')
    .select('question_id')
    .in('question_id', ids)
  const withComment = new Set((existingComments ?? []).map((c) => c.question_id as string))

  const result: CommentRow[] = rows.map((r) => {
    const exam = r.exams as unknown as {
      year: number
      booklet_color: string | null
      specialties: { name: string } | null
    } | null
    const specName = exam?.specialties?.name ?? 'Exame'
    const color = exam?.booklet_color ? ` · ${exam.booklet_color}` : ''
    return {
      id: r.id as string,
      question_number: r.question_number as number,
      stem: ((r.stem as string | null) ?? '').slice(0, 120),
      exam_id: r.exam_id as string,
      exam_label: `${specName} ${exam?.year ?? ''}${color}`.trim(),
      has_comment: withComment.has(r.id as string),
      extraction_confidence: (r.extraction_confidence as number | null) ?? null,
    }
  })

  if (filter.withoutCommentOnly) return result.filter((r) => !r.has_comment)
  return result
}

export async function listExamsForFilter(): Promise<
  { id: string; label: string }[]
> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('exams')
    .select('id, year, booklet_color, specialties(name)')
    .order('created_at', { ascending: false })
    .limit(100)
  return (data ?? []).map((e) => {
    const sp = e.specialties as unknown as { name: string } | null
    const color = e.booklet_color ? ` · ${e.booklet_color}` : ''
    return {
      id: e.id as string,
      label: `${sp?.name ?? 'Exame'} ${e.year}${color}`,
    }
  })
}
