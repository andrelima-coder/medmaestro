'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

export interface ExamOption {
  id: string
  year: number
  booklet_color: string | null
  board: { id: string; name: string; short_name: string } | null
  specialty: { id: string; name: string } | null
}

export async function listExamsForReassignment(): Promise<ExamOption[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('exams')
    .select(
      'id, year, booklet_color, exam_boards(id, name, short_name), specialties(id, name)'
    )
    .order('year', { ascending: false })

  return ((data ?? []) as unknown as Array<{
    id: string
    year: number
    booklet_color: string | null
    exam_boards: { id: string; name: string; short_name: string } | null
    specialties: { id: string; name: string } | null
  }>).map((row) => ({
    id: row.id,
    year: row.year,
    booklet_color: row.booklet_color,
    board: row.exam_boards,
    specialty: row.specialties,
  }))
}

export async function reassignQuestionExam(
  questionId: string,
  newExamId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const service = createServiceClient()

  // Estado atual
  const { data: question } = await service
    .from('questions')
    .select('exam_id, question_number')
    .eq('id', questionId)
    .single()

  if (!question) return { ok: false, error: 'Questão não encontrada' }

  if (question.exam_id === newExamId) {
    return { ok: true }
  }

  // Confere conflito de UNIQUE(exam_id, question_number) no exame de destino
  const { data: conflict } = await service
    .from('questions')
    .select('id')
    .eq('exam_id', newExamId)
    .eq('question_number', question.question_number)
    .maybeSingle()

  if (conflict) {
    return {
      ok: false,
      error: `Já existe a questão ${question.question_number} no exame de destino. Renumere antes de reatribuir.`,
    }
  }

  // Snapshot anterior
  const { data: lastRev } = await service
    .from('question_revisions')
    .select('revision_number')
    .eq('question_id', questionId)
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextRevision = (lastRev?.revision_number ?? 0) + 1

  const { error: revErr } = await service.from('question_revisions').insert({
    question_id: questionId,
    revision_number: nextRevision,
    created_by: user.id,
    snapshot: {
      change_type: 'exam_reassign',
      previous_exam_id: question.exam_id,
      new_exam_id: newExamId,
    },
    change_reason: 'exam_reassign',
  })

  if (revErr) return { ok: false, error: revErr.message }

  const { error: updErr } = await service
    .from('questions')
    .update({ exam_id: newExamId, updated_at: new Date().toISOString() })
    .eq('id', questionId)

  if (updErr) return { ok: false, error: updErr.message }

  await logAudit(
    user.id,
    'question',
    questionId,
    'question_exam_reassigned',
    { exam_id: question.exam_id },
    { exam_id: newExamId }
  )

  revalidatePath(`/revisao/${questionId}`)
  return { ok: true }
}
