'use server'

import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  generateVariationsForQuestion,
  promoteVariationToQuestion,
  type DifficultyDelta,
} from '@/lib/variations/generate'
import { logAudit } from '@/lib/audit'
import { QUESTIONS_PAGE_SIZE } from '@/lib/pagination'
import { requireUser, requireReviewer } from '@/lib/auth/guards'
import { examLabel } from '@/lib/exams/label'

// Questões promovidas a partir de variações recebem question_number >= 1000.
// Elas NÃO devem realimentar a geração ("variação de variação").
const PROMOTED_NUMBER_FLOOR = 1000

const BATCH_CONCURRENCY = 2

export type GenerateBatchResult = {
  ok: boolean
  queued?: number
  error?: string
}

export async function generateVariationsBatchAction(
  questionIds: string[],
  config: {
    count: number
    difficultyDelta: DifficultyDelta
    inheritTags: boolean
    model: 'sonnet' | 'opus'
  }
): Promise<GenerateBatchResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (questionIds.length === 0)
    return { ok: false, error: 'Nenhuma questão selecionada' }

  const ids = [...new Set(questionIds)]

  await logAudit(user.id, 'question', ids[0], 'variations_batch_triggered', null, {
    count: ids.length,
    variations_per_question: config.count,
    difficulty_delta: config.difficultyDelta,
    model: config.model,
  })

  after(async () => {
    for (let i = 0; i < ids.length; i += BATCH_CONCURRENCY) {
      const batch = ids.slice(i, i + BATCH_CONCURRENCY)
      await Promise.allSettled(
        batch.map((id) => generateVariationsForQuestion(id, config))
      )
    }
  })

  return { ok: true, queued: ids.length }
}

export type VariationListRow = {
  id: string
  question_number: number
  stem: string
  exam_id: string
  exam_label: string
  variations_count: number
  extraction_confidence: number | null
}

export type VariationListPage = { rows: VariationListRow[]; total: number }

export async function listQuestionsForVariations(
  filter: {
    examId?: string
    withoutVariationOnly?: boolean
  },
  pagination: { page: number; pageSize?: number }
): Promise<VariationListPage> {
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
    .lt('question_number', PROMOTED_NUMBER_FLOOR)
    .order('exam_id', { ascending: false })
    .order('question_number', { ascending: true })

  if (filter.examId) query = query.eq('exam_id', filter.examId)

  // Filtro "apenas sem variação": exclui no banco as questões que já têm
  // variações, para count e paginação refletirem o conjunto filtrado.
  if (filter.withoutVariationOnly) {
    const { data: vars } = await supabase
      .from('question_variations')
      .select('source_question_id')
    const withVarIds = [...new Set((vars ?? []).map((v) => v.source_question_id as string))]
    if (withVarIds.length > 0) {
      query = query.not('id', 'in', `(${withVarIds.join(',')})`)
    }
  }

  const { data: rows, count } = await query.range(from, to)
  if (!rows) return { rows: [], total: count ?? 0 }

  // Contagem de variações só para as linhas da página atual.
  const pageIds = rows.map((r) => r.id as string)
  const counts: Record<string, number> = {}
  if (!filter.withoutVariationOnly && pageIds.length > 0) {
    const { data: vars } = await supabase
      .from('question_variations')
      .select('source_question_id')
      .in('source_question_id', pageIds)
    for (const v of vars ?? []) {
      const id = v.source_question_id as string
      counts[id] = (counts[id] ?? 0) + 1
    }
  }

  const result: VariationListRow[] = rows.map((r) => {
    const exam = r.exams as unknown as {
      year: number
      booklet_color: string | null
      specialties: { name: string } | null
    } | null
    return {
      id: r.id as string,
      question_number: r.question_number as number,
      stem: ((r.stem as string | null) ?? '').slice(0, 120),
      exam_id: r.exam_id as string,
      exam_label: examLabel({
        name: exam?.specialties?.name,
        year: exam?.year,
        bookletColor: exam?.booklet_color,
      }),
      variations_count: counts[r.id as string] ?? 0,
      extraction_confidence: (r.extraction_confidence as number | null) ?? null,
    }
  })

  return { rows: result, total: count ?? 0 }
}

/**
 * Retorna apenas os IDs das questões que batem no filtro atual (todas as
 * páginas). Usado para "selecionar todas as N filtradas" sem baixar as linhas.
 */
export async function listFilteredVariationQuestionIds(filter: {
  examId?: string
  withoutVariationOnly?: boolean
}): Promise<string[]> {
  const auth = await requireUser()
  if (!auth.ok) return []
  const supabase = createServiceClient()

  let query = supabase
    .from('questions')
    .select('id, exams!inner(year)')
    .lt('question_number', PROMOTED_NUMBER_FLOOR)
    .order('exam_id', { ascending: false })
    .order('question_number', { ascending: true })
    .limit(5000)

  if (filter.examId) query = query.eq('exam_id', filter.examId)

  if (filter.withoutVariationOnly) {
    const { data: vars } = await supabase
      .from('question_variations')
      .select('source_question_id')
    const withVarIds = [...new Set((vars ?? []).map((v) => v.source_question_id as string))]
    if (withVarIds.length > 0) {
      query = query.not('id', 'in', `(${withVarIds.join(',')})`)
    }
  }

  const { data } = await query
  return (data ?? []).map((r) => r.id as string)
}

export async function listExamsForVariationsFilter(): Promise<
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
    return {
      id: e.id as string,
      label: examLabel({
        name: sp?.name,
        year: e.year as number,
        bookletColor: e.booklet_color as string | null,
      }),
    }
  })
}

export type PendingVariation = {
  id: string
  stem: string
  alternatives: Record<string, string>
  correct_answer: string | null
  rationale: string | null
  difficulty_delta: number
  source_question_id: string
  source_question_number: number | null
  source_stem: string
  exam_label: string
}

export async function listPendingVariations(): Promise<PendingVariation[]> {
  const auth = await requireUser()
  if (!auth.ok) return []
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('question_variations')
    .select(
      'id, stem, alternatives, correct_answer, rationale, difficulty_delta, source_question_id, questions!source_question_id(question_number, stem, exams(year, booklet_color, specialties(name)))'
    )
    .eq('approved', false)
    .is('promoted_question_id', null)
    .order('created_at', { ascending: false })
    .limit(200)

  return (data ?? []).map((v) => {
    const q = v.questions as unknown as {
      question_number: number | null
      stem: string | null
      exams: {
        year: number
        booklet_color: string | null
        specialties: { name: string } | null
      } | null
    } | null
    const exam = q?.exams ?? null
    return {
      id: v.id as string,
      stem: v.stem as string,
      alternatives: (v.alternatives as Record<string, string> | null) ?? {},
      correct_answer: (v.correct_answer as string | null) ?? null,
      rationale: (v.rationale as string | null) ?? null,
      difficulty_delta: (v.difficulty_delta as number | null) ?? 0,
      source_question_id: v.source_question_id as string,
      source_question_number: q?.question_number ?? null,
      source_stem: ((q?.stem as string | null) ?? '').slice(0, 200),
      exam_label: exam
        ? examLabel({
            name: exam.specialties?.name,
            year: exam.year,
            bookletColor: exam.booklet_color,
          })
        : '—',
    }
  })
}

export async function approveVariationAction(
  id: string
): Promise<{ ok: boolean; questionId?: string; error?: string }> {
  const auth = await requireReviewer()
  if (!auth.ok) return { ok: false }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { error } = await service
    .from('question_variations')
    .update({
      approved: true,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  // AUDITORIA 2026-07: aprovar agora PROMOVE automaticamente. Antes, a variação
  // aprovada saía da fila de revisão mas não existia em nenhuma outra tela nem
  // podia entrar em simulado — caía num limbo invisível.
  const promoted = await promoteVariationToQuestion(id)
  if (!promoted.ok) {
    // Aprovação ficou registrada; promoção pode ser refeita depois.
    return { ok: true, error: `Aprovada, mas promoção falhou: ${promoted.error}` }
  }
  return { ok: true, questionId: promoted.questionId }
}

export async function rejectVariationAction(id: string): Promise<{ ok: boolean }> {
  const auth = await requireReviewer()
  if (!auth.ok) return { ok: false }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { error } = await service.from('question_variations').delete().eq('id', id)
  return { ok: !error }
}

export async function promoteVariationAction(
  id: string
): Promise<{ ok: boolean; questionId?: string; error?: string }> {
  const auth = await requireReviewer()
  if (!auth.ok) return { ok: false, error: auth.error }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return promoteVariationToQuestion(id)
}
