'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { requireRole } from '@/lib/auth/guards'
import { logAudit } from '@/lib/audit'

export type DeleteExamResult = {
  ok: boolean
  error?: string
  deletedQuestions?: number
}

/**
 * Exclui um lote (exam) e tudo que depende dele — pensado para cadernos com
 * erro de extração ou dos quais se desistiu.
 *
 * Salvaguardas (a exclusão é recusada se):
 *  - o caderno tem questões APROVADAS ou PUBLICADAS (trabalho editorial);
 *  - alguma questão está em simulado (simulado_questions) — o FK é RESTRICT;
 *  - alguma questão tem respostas de alunos (question_attempts/practice) — FK RESTRICT.
 *
 * Ordem de limpeza: jobs → questões (filhos via ON DELETE CASCADE) → exam
 * (answer_keys via CASCADE; api_usage vira NULL). Arquivos do Storage
 * (páginas/figuras, anexos e PDFs do caderno) são removidos em best-effort.
 */
export async function deleteExamAction(examId: string): Promise<DeleteExamResult> {
  const auth = await requireRole('admin')
  if (!auth.ok) return { ok: false, error: auth.error }

  const service = createServiceClient()

  const { data: exam, error: examErr } = await service
    .from('exams')
    .select('id, year, booklet_color, status, source_pdf_path, answer_key_pdf_path, source_original_path')
    .eq('id', examId)
    .single()
  if (examErr || !exam) return { ok: false, error: 'Lote não encontrado' }

  const { data: questions } = await service
    .from('questions')
    .select('id, status')
    .eq('exam_id', examId)
  const qIds = (questions ?? []).map((q) => q.id as string)

  // ── Salvaguardas ─────────────────────────────────────────────────────────
  const reviewed = (questions ?? []).filter((q) =>
    ['approved', 'published'].includes((q.status as string) ?? '')
  )
  if (reviewed.length > 0) {
    return {
      ok: false,
      error: `Este lote tem ${reviewed.length} questão(ões) aprovada(s)/publicada(s). Rejeite-as ou mova-as antes de excluir.`,
    }
  }

  if (qIds.length > 0) {
    const { count: inSimulado } = await service
      .from('simulado_questions')
      .select('id', { count: 'exact', head: true })
      .in('question_id', qIds)
    if ((inSimulado ?? 0) > 0) {
      return {
        ok: false,
        error: `Questões deste lote estão em ${inSimulado} posição(ões) de simulado. Remova-as dos simulados antes de excluir.`,
      }
    }

    const { count: withAttempts } = await service
      .from('question_attempts')
      .select('id', { count: 'exact', head: true })
      .in('question_id', qIds)
    if ((withAttempts ?? 0) > 0) {
      return {
        ok: false,
        error: 'Questões deste lote já têm respostas de alunos — exclusão bloqueada para preservar o histórico.',
      }
    }
  }

  // ── Paths do Storage (coletados ANTES de deletar as linhas) ──────────────
  const imagePaths: string[] = []
  const attachmentPaths: string[] = []
  if (qIds.length > 0) {
    const { data: imgs } = await service
      .from('question_images')
      .select('full_page_path, cropped_path')
      .in('question_id', qIds)
    for (const im of imgs ?? []) {
      if (im.full_page_path) imagePaths.push(im.full_page_path as string)
      if (im.cropped_path) imagePaths.push(im.cropped_path as string)
    }
    const { data: atts } = await service
      .from('question_attachments')
      .select('storage_path')
      .in('question_id', qIds)
    for (const at of atts ?? []) {
      if (at.storage_path) attachmentPaths.push(at.storage_path as string)
    }
  }

  // ── Limpeza no banco ─────────────────────────────────────────────────────
  // jobs têm FK sem CASCADE (bloqueiam o delete) — removidos primeiro.
  await service.from('jobs').delete().eq('exam_id', examId)
  if (qIds.length > 0) {
    await service.from('jobs').delete().in('question_id', qIds)
    const { error: qDelErr } = await service.from('questions').delete().in('id', qIds)
    if (qDelErr) return { ok: false, error: `Falha ao excluir questões: ${qDelErr.message}` }
  }

  const { error: examDelErr } = await service.from('exams').delete().eq('id', examId)
  if (examDelErr) return { ok: false, error: `Falha ao excluir o lote: ${examDelErr.message}` }

  // ── Storage (best-effort; órfãos são tolerados) ──────────────────────────
  const chunk = <T,>(arr: T[], n: number): T[][] => {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
    return out
  }
  for (const batch of chunk([...new Set(imagePaths)], 100)) {
    await service.storage.from('question-images').remove(batch).catch(() => {})
  }
  for (const batch of chunk([...new Set(attachmentPaths)], 100)) {
    await service.storage.from('question-attachments').remove(batch).catch(() => {})
  }
  const pdfPaths = [exam.source_pdf_path, exam.answer_key_pdf_path, exam.source_original_path]
    .filter((p): p is string => !!p)
  if (pdfPaths.length > 0) {
    await service.storage.from('exam-pdfs').remove(pdfPaths).catch(() => {})
  }

  await logAudit(auth.user.id, 'exam', examId, 'exam_deleted', {
    year: exam.year,
    booklet_color: exam.booklet_color,
    status: exam.status,
    questions: qIds.length,
  })

  revalidatePath('/lotes')
  revalidatePath('/dashboard')
  return { ok: true, deletedQuestions: qIds.length }
}
