'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sanitizeHtml } from '@/lib/sanitize-html'

export type BancoFilter = {
  examId?: string
  cardType?: string
  status?: 'all' | 'approved' | 'pending'
  query?: string
  difficulty?: number | null
  page?: number
  pageSize?: number
}

export type BancoFlashcard = {
  id: string
  front: string
  back: string
  card_type: string | null
  difficulty: number | null
  approved: boolean
  approved_at: string | null
  created_at: string
  source_question_id: string | null
  question_number: number | null
  exam_id: string | null
  exam_label: string
  srs_due_at: string | null
  srs_reviews: number | null
}

export type BancoListResult = {
  rows: BancoFlashcard[]
  total: number
  page: number
  pageSize: number
}

const DEFAULT_PAGE_SIZE = 50

export async function listBancoFlashcards(
  filter: BancoFilter
): Promise<BancoListResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const page = Math.max(1, filter.page ?? 1)
  const pageSize = Math.max(1, Math.min(200, filter.pageSize ?? DEFAULT_PAGE_SIZE))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let allowedQuestionIds: string[] | null = null
  if (filter.examId) {
    const { data: qs } = await service
      .from('questions')
      .select('id')
      .eq('exam_id', filter.examId)
    allowedQuestionIds = (qs ?? []).map((q) => q.id as string)
    if (allowedQuestionIds.length === 0) {
      return { rows: [], total: 0, page, pageSize }
    }
  }

  let query = service
    .from('flashcards')
    .select(
      'id, front, back, card_type, difficulty, approved, approved_at, created_at, source_question_id, srs_due_at, srs_reviews, questions(question_number, exam_id, exams(year, booklet_color, specialties(name)))',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filter.status === 'approved') query = query.eq('approved', true)
  else if (filter.status === 'pending') query = query.eq('approved', false)

  if (filter.cardType && filter.cardType !== 'all') {
    query = query.eq('card_type', filter.cardType)
  }
  if (filter.difficulty != null) {
    query = query.eq('difficulty', filter.difficulty)
  }
  if (allowedQuestionIds) {
    query = query.in('source_question_id', allowedQuestionIds)
  }
  if (filter.query && filter.query.trim()) {
    const q = filter.query.trim().replace(/[%_]/g, '')
    query = query.or(`front.ilike.%${q}%,back.ilike.%${q}%`)
  }

  const { data, error, count } = await query
  if (error) {
    return { rows: [], total: 0, page, pageSize }
  }

  type Row = {
    id: string
    front: string
    back: string
    card_type: string | null
    difficulty: number | null
    approved: boolean | null
    approved_at: string | null
    created_at: string
    source_question_id: string | null
    srs_due_at: string | null
    srs_reviews: number | null
    questions: {
      question_number: number | null
      exam_id: string | null
      exams: {
        year: number | null
        booklet_color: string | null
        specialties: { name: string | null } | null
      } | null
    } | null
  }

  const rows: BancoFlashcard[] = ((data ?? []) as unknown as Row[]).map((r) => {
    const exam = r.questions?.exams
    const specName = exam?.specialties?.name ?? ''
    const color = exam?.booklet_color ? ` · ${exam.booklet_color}` : ''
    const examLabel = exam ? `${specName} ${exam.year ?? ''}${color}`.trim() : '—'
    return {
      id: r.id,
      front: r.front ?? '',
      back: r.back ?? '',
      card_type: r.card_type,
      difficulty: r.difficulty,
      approved: !!r.approved,
      approved_at: r.approved_at,
      created_at: r.created_at,
      source_question_id: r.source_question_id,
      question_number: r.questions?.question_number ?? null,
      exam_id: r.questions?.exam_id ?? null,
      exam_label: examLabel,
      srs_due_at: r.srs_due_at,
      srs_reviews: r.srs_reviews,
    }
  })

  return { rows, total: count ?? rows.length, page, pageSize }
}

export async function listBancoExams(): Promise<{ id: string; label: string }[]> {
  const service = createServiceClient()
  const { data } = await service
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

export async function updateBancoFlashcardAction(
  id: string,
  patch: { front?: string; back?: string; difficulty?: number; approved?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.front !== undefined) update.front = sanitizeHtml(patch.front).slice(0, 4000)
  if (patch.back !== undefined) update.back = sanitizeHtml(patch.back).slice(0, 8000)
  if (patch.difficulty !== undefined) {
    update.difficulty = Math.max(1, Math.min(5, Math.round(patch.difficulty)))
  }
  if (patch.approved !== undefined) {
    update.approved = patch.approved
    if (patch.approved) {
      update.approved_by = user.id
      update.approved_at = new Date().toISOString()
    } else {
      update.approved_by = null
      update.approved_at = null
    }
  }

  const { error } = await service.from('flashcards').update(update).eq('id', id)
  return { ok: !error, error: error?.message }
}

export async function deleteBancoFlashcardAction(
  id: string
): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { error } = await service.from('flashcards').delete().eq('id', id)
  return { ok: !error }
}
