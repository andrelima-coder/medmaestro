'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  generateFlashcardsForQuestion,
  suggestFlashcardCounts,
  type CardType,
} from '@/lib/flashcards/generate'
import { logAudit } from '@/lib/audit'
import { sanitizeHtml } from '@/lib/sanitize-html'
import { QUESTIONS_PAGE_SIZE } from '@/lib/pagination'
import { requireUser, requireReviewer } from '@/lib/auth/guards'

const BATCH_CONCURRENCY = 3

export type SuggestCountsResult = {
  ok: boolean
  counts?: Record<string, number>
  error?: string
}

export async function suggestCountsAction(
  questionIds: string[]
): Promise<SuggestCountsResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (questionIds.length === 0) return { ok: false, error: 'Nenhuma questão selecionada' }

  try {
    const counts = await suggestFlashcardCounts(questionIds)
    return { ok: true, counts }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export type GenerateInlineItem = { questionId: string; count: number }

export type GenerateInlineResult = {
  ok: boolean
  created: number
  failed: number
  errors: string[]
  error?: string
}

export async function generateFlashcardsInlineAction(
  items: GenerateInlineItem[],
  config: { types: CardType[]; inheritTags: boolean }
): Promise<GenerateInlineResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clean = items.filter((it) => it.questionId && it.count > 0)
  if (clean.length === 0) {
    return { ok: false, created: 0, failed: 0, errors: [], error: 'Nenhuma questão selecionada' }
  }
  if (config.types.length === 0) {
    return { ok: false, created: 0, failed: 0, errors: [], error: 'Selecione ao menos um tipo de card' }
  }

  await logAudit(user.id, 'question', clean[0].questionId, 'flashcards_batch_triggered', null, {
    count: clean.length,
    total_cards_requested: clean.reduce((s, it) => s + it.count, 0),
    types: config.types,
  })

  let created = 0
  let failed = 0
  const errors: string[] = []

  for (let i = 0; i < clean.length; i += BATCH_CONCURRENCY) {
    const batch = clean.slice(i, i + BATCH_CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map((it) =>
        generateFlashcardsForQuestion(it.questionId, {
          count: it.count,
          types: config.types,
          inheritTags: config.inheritTags,
        })
      )
    )
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.ok) {
        created += r.value.created
      } else {
        failed += 1
        const msg =
          r.status === 'fulfilled'
            ? r.value.error ?? 'erro desconhecido'
            : r.reason instanceof Error
              ? r.reason.message
              : String(r.reason)
        if (errors.length < 5) errors.push(msg)
      }
    }
  }

  return { ok: created > 0, created, failed, errors }
}

export type FlashcardsListRow = {
  id: string
  question_number: number
  stem: string
  exam_id: string
  exam_label: string
  flashcards_count: number
  extraction_confidence: number | null
}

export type FlashcardsListPage = { rows: FlashcardsListRow[]; total: number }

export async function listQuestionsForFlashcards(
  filter: {
    examId?: string
    withoutFlashcardOnly?: boolean
    lowConfidenceOnly?: boolean
  },
  pagination: { page: number; pageSize?: number }
): Promise<FlashcardsListPage> {
  const auth = await requireUser()
  if (!auth.ok) return { rows: [], total: 0 }
  const supabase = createServiceClient()
  const pageSize = pagination.pageSize ?? QUESTIONS_PAGE_SIZE
  const page = Math.max(1, pagination.page)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('questions')
    .select(
      'id, question_number, stem, exam_id, extraction_confidence, exams!inner(year, booklet_color, specialties(name))',
      { count: 'exact' }
    )
    .order('exam_id', { ascending: false })
    .order('question_number', { ascending: true })

  if (filter.examId) query = query.eq('exam_id', filter.examId)
  if (filter.lowConfidenceOnly) query = query.lte('extraction_confidence', 2)

  // Filtro "apenas sem flashcard": exclui no banco as questões que já têm
  // flashcards, para count e paginação refletirem o conjunto filtrado.
  if (filter.withoutFlashcardOnly) {
    const { data: cards } = await supabase
      .from('flashcards')
      .select('source_question_id')
    const withCardIds = [...new Set((cards ?? []).map((c) => c.source_question_id as string))]
    if (withCardIds.length > 0) {
      query = query.not('id', 'in', `(${withCardIds.join(',')})`)
    }
  }

  const { data: rows, count } = await query.range(from, to)
  if (!rows) return { rows: [], total: count ?? 0 }

  // Contagem de flashcards só para as linhas da página atual.
  const pageIds = rows.map((r) => r.id as string)
  const counts: Record<string, number> = {}
  if (!filter.withoutFlashcardOnly && pageIds.length > 0) {
    const { data: cards } = await supabase
      .from('flashcards')
      .select('source_question_id')
      .in('source_question_id', pageIds)
    for (const c of cards ?? []) {
      const id = c.source_question_id as string
      counts[id] = (counts[id] ?? 0) + 1
    }
  }

  const result: FlashcardsListRow[] = rows.map((r) => {
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
      flashcards_count: counts[r.id as string] ?? 0,
      extraction_confidence: (r.extraction_confidence as number | null) ?? null,
    }
  })

  return { rows: result, total: count ?? 0 }
}

/**
 * Retorna apenas os IDs das questões que batem no filtro atual (todas as
 * páginas). Usado para "selecionar todas as N filtradas" sem baixar as linhas.
 */
export async function listFilteredFlashcardQuestionIds(filter: {
  examId?: string
  withoutFlashcardOnly?: boolean
  lowConfidenceOnly?: boolean
}): Promise<string[]> {
  const auth = await requireUser()
  if (!auth.ok) return []
  const supabase = createServiceClient()

  let query = supabase
    .from('questions')
    .select('id, exams!inner(year)')
    .order('exam_id', { ascending: false })
    .order('question_number', { ascending: true })
    .limit(5000)

  if (filter.examId) query = query.eq('exam_id', filter.examId)
  if (filter.lowConfidenceOnly) query = query.lte('extraction_confidence', 2)

  if (filter.withoutFlashcardOnly) {
    const { data: cards } = await supabase
      .from('flashcards')
      .select('source_question_id')
    const withCardIds = [...new Set((cards ?? []).map((c) => c.source_question_id as string))]
    if (withCardIds.length > 0) {
      query = query.not('id', 'in', `(${withCardIds.join(',')})`)
    }
  }

  const { data } = await query
  return (data ?? []).map((r) => r.id as string)
}

export async function listExamsForFlashcardsFilter(): Promise<
  { id: string; label: string }[]
> {
  const auth = await requireUser()
  if (!auth.ok) return []
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

export type PendingCard = {
  id: string
  front: string
  back: string
  card_type: string
  difficulty: number
  source_question_id: string | null
  question_number: number | null
  exam_label: string
}

export async function listPendingFlashcards(): Promise<PendingCard[]> {
  const auth = await requireUser()
  if (!auth.ok) return []
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('flashcards')
    .select(
      'id, front, back, card_type, difficulty, source_question_id, questions(question_number, exams(year, booklet_color, specialties(name)))'
    )
    .eq('approved', false)
    .order('created_at', { ascending: false })
    .limit(200)

  return (data ?? []).map((c) => {
    const q = c.questions as unknown as {
      question_number: number | null
      exams: {
        year: number
        booklet_color: string | null
        specialties: { name: string } | null
      } | null
    } | null
    const exam = q?.exams ?? null
    const specName = exam?.specialties?.name ?? 'Exame'
    const color = exam?.booklet_color ? ` · ${exam.booklet_color}` : ''
    return {
      id: c.id as string,
      front: c.front as string,
      back: c.back as string,
      card_type: c.card_type as string,
      difficulty: c.difficulty as number,
      source_question_id: (c.source_question_id as string | null) ?? null,
      question_number: q?.question_number ?? null,
      exam_label: exam ? `${specName} ${exam.year}${color}` : '—',
    }
  })
}

export async function approveFlashcardAction(id: string): Promise<{ ok: boolean }> {
  const auth = await requireReviewer()
  if (!auth.ok) return { ok: false }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { error } = await service
    .from('flashcards')
    .update({
      approved: true,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  return { ok: !error }
}

export async function rejectFlashcardAction(id: string): Promise<{ ok: boolean }> {
  const auth = await requireReviewer()
  if (!auth.ok) return { ok: false }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { error } = await service.from('flashcards').delete().eq('id', id)
  return { ok: !error }
}

export async function editFlashcardAction(
  id: string,
  patch: { front?: string; back?: string; difficulty?: number }
): Promise<{ ok: boolean }> {
  const auth = await requireReviewer()
  if (!auth.ok) return { ok: false }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (patch.front !== undefined) update.front = sanitizeHtml(patch.front).slice(0, 4000)
  if (patch.back !== undefined) update.back = sanitizeHtml(patch.back).slice(0, 8000)
  if (patch.difficulty !== undefined)
    update.difficulty = Math.max(1, Math.min(5, Math.round(patch.difficulty)))

  const { error } = await service.from('flashcards').update(update).eq('id', id)
  return { ok: !error }
}
