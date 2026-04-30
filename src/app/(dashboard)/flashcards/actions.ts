'use server'

import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateFlashcardsForQuestion, type CardType } from '@/lib/flashcards/generate'
import { logAudit } from '@/lib/audit'

const BATCH_CONCURRENCY = 3

export type GenerateBatchResult = {
  ok: boolean
  queued?: number
  error?: string
}

export async function generateFlashcardsBatchAction(
  questionIds: string[],
  config: { count: number; types: CardType[]; inheritTags: boolean }
): Promise<GenerateBatchResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (questionIds.length === 0) {
    return { ok: false, error: 'Nenhuma questão selecionada' }
  }
  if (config.types.length === 0) {
    return { ok: false, error: 'Selecione ao menos um tipo de card' }
  }

  const ids = [...new Set(questionIds)]

  await logAudit(user.id, 'question', ids[0], 'flashcards_batch_triggered', null, {
    count: ids.length,
    cards_per_question: config.count,
    types: config.types,
  })

  after(async () => {
    for (let i = 0; i < ids.length; i += BATCH_CONCURRENCY) {
      const batch = ids.slice(i, i + BATCH_CONCURRENCY)
      await Promise.allSettled(
        batch.map((id) => generateFlashcardsForQuestion(id, config))
      )
    }
  })

  return { ok: true, queued: ids.length }
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

export async function listQuestionsForFlashcards(filter: {
  examId?: string
  withoutFlashcardOnly?: boolean
  lowConfidenceOnly?: boolean
}): Promise<FlashcardsListRow[]> {
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
  const { data: cards } = await supabase
    .from('flashcards')
    .select('source_question_id')
    .in('source_question_id', ids)

  const counts: Record<string, number> = {}
  for (const c of cards ?? []) {
    const id = c.source_question_id as string
    counts[id] = (counts[id] ?? 0) + 1
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

  if (filter.withoutFlashcardOnly) return result.filter((r) => r.flashcards_count === 0)
  return result
}

export async function listExamsForFlashcardsFilter(): Promise<
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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (patch.front !== undefined) update.front = patch.front.slice(0, 500)
  if (patch.back !== undefined) update.back = patch.back.slice(0, 1500)
  if (patch.difficulty !== undefined)
    update.difficulty = Math.max(1, Math.min(5, Math.round(patch.difficulty)))

  const { error } = await service.from('flashcards').update(update).eq('id', id)
  return { ok: !error }
}
