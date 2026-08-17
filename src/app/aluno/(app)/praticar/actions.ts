'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPracticeBatch, getCorrection, type PracticeQuestion } from '@/lib/aluno/estudo'
import { isQuestionLockedByActiveExam } from '@/lib/aluno/exam-lock'

// Prática avulsa (feature 003 — B005).

export async function getBatchAction(
  moduleTagId: string | null
): Promise<PracticeQuestion[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const service = createServiceClient()
  return getPracticeBatch(service, moduleTagId, 10)
}

export type PracticeResult = {
  ok: boolean
  isCorrect?: boolean
  correctAnswer?: string | null
  comment?: string | null
  error?: string
}

export async function recordPracticeAction(
  questionId: string,
  selectedAlt: string
): Promise<PracticeResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado.' }
  if (!['A', 'B', 'C', 'D', 'E'].includes(selectedAlt)) {
    return { ok: false, error: 'Alternativa inválida.' }
  }

  const service = createServiceClient()
  // Não revelar gabarito de questão que está num simulado em andamento do aluno
  // (burlaria a prova ranqueada). Também evita poluir as estatísticas de prática.
  if (await isQuestionLockedByActiveExam(service, user.id, questionId)) {
    return {
      ok: false,
      error: 'Esta questão faz parte de um simulado em andamento — finalize o simulado antes de praticá-la.',
    }
  }
  const { correctAnswer, comment } = await getCorrection(service, questionId)
  const isCorrect = correctAnswer != null && selectedAlt === correctAnswer

  const { error } = await service.from('practice_attempts').insert({
    user_id: user.id,
    question_id: questionId,
    selected_alt: selectedAlt,
    is_correct: isCorrect,
  })
  if (error) return { ok: false, error: 'Falha ao registrar.' }

  return { ok: true, isCorrect, correctAnswer, comment }
}
