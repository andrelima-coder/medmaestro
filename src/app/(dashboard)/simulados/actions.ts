'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function createSimuladoAction(
  formData: FormData
): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Não autenticado' }

  const title = (formData.get('title') as string)?.trim()
  if (!title) return { error: 'Título obrigatório' }

  const service = createServiceClient()
  const { data, error } = await service
    .from('simulados')
    .insert({ title, created_by: user.id })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Falha ao criar' }

  await logAudit(user.id, 'simulado', data.id, 'simulado_created', null, { title })

  redirect(`/simulados/${data.id}`)
}

export async function updateSimuladoTitle(
  simuladoId: string,
  title: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const service = createServiceClient()
  const { error } = await service
    .from('simulados')
    .update({ title: title.trim() })
    .eq('id', simuladoId)
    .eq('created_by', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/simulados/${simuladoId}`)
  return { ok: true }
}

export async function deleteSimuladoAction(simuladoId: string): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { error } = await service
    .from('simulados')
    .delete()
    .eq('id', simuladoId)
    .eq('created_by', user.id)

  if (error) return { error: error.message }

  await logAudit(user.id, 'simulado', simuladoId, 'simulado_deleted', null, null)

  redirect('/simulados')
}

export async function addQuestionToSimulado(
  simuladoId: string,
  questionId: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const service = createServiceClient()

  // Verifica propriedade
  const { data: simulado } = await service
    .from('simulados')
    .select('id')
    .eq('id', simuladoId)
    .eq('created_by', user.id)
    .single()

  if (!simulado) return { ok: false, error: 'Simulado não encontrado' }

  // Próxima posição
  const { data: lastPos } = await service
    .from('simulado_questions')
    .select('position')
    .eq('simulado_id', simuladoId)
    .order('position', { ascending: false })
    .limit(1)
    .single()

  const position = (lastPos?.position ?? 0) + 1

  const { error } = await service.from('simulado_questions').insert({
    simulado_id: simuladoId,
    question_id: questionId,
    position,
  })

  if (error) return { ok: false, error: error.message }

  await logAudit(user.id, 'simulado', simuladoId, 'simulado_question_added', null, {
    question_id: questionId,
    position,
  })

  revalidatePath(`/simulados/${simuladoId}`)
  return { ok: true }
}

export async function removeQuestionFromSimulado(
  simuladoId: string,
  questionId: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const service = createServiceClient()

  const { data: simulado } = await service
    .from('simulados')
    .select('id')
    .eq('id', simuladoId)
    .eq('created_by', user.id)
    .single()

  if (!simulado) return { ok: false, error: 'Simulado não encontrado' }

  const { error } = await service
    .from('simulado_questions')
    .delete()
    .eq('simulado_id', simuladoId)
    .eq('question_id', questionId)

  if (error) return { ok: false, error: error.message }

  await logAudit(user.id, 'simulado', simuladoId, 'simulado_question_removed', null, {
    question_id: questionId,
  })

  // Resequencia posições
  const { data: remaining } = await service
    .from('simulado_questions')
    .select('id')
    .eq('simulado_id', simuladoId)
    .order('position', { ascending: true })

  if (remaining && remaining.length > 0) {
    await Promise.all(
      remaining.map((row, i) =>
        service
          .from('simulado_questions')
          .update({ position: i + 1 })
          .eq('id', row.id)
      )
    )
  }

  revalidatePath(`/simulados/${simuladoId}`)
  return { ok: true }
}

export async function updateSimuladoQuestionNote(
  simuladoId: string,
  sqId: string,
  note: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const service = createServiceClient()

  const { data: simulado } = await service
    .from('simulados')
    .select('id')
    .eq('id', simuladoId)
    .eq('created_by', user.id)
    .single()

  if (!simulado) return { ok: false, error: 'Simulado não encontrado' }

  const { error } = await service
    .from('simulado_questions')
    .update({ note: note.trim() || null })
    .eq('id', sqId)
    .eq('simulado_id', simuladoId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/simulados/${simuladoId}`)
  return { ok: true }
}

export async function moveSimuladoQuestion(
  simuladoId: string,
  sqId: string,
  direction: 'up' | 'down'
): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const service = createServiceClient()

  const { data: simulado } = await service
    .from('simulados')
    .select('id')
    .eq('id', simuladoId)
    .eq('created_by', user.id)
    .single()

  if (!simulado) return { ok: false, error: 'Simulado não encontrado' }

  const { data: rows } = await service
    .from('simulado_questions')
    .select('id, position')
    .eq('simulado_id', simuladoId)
    .order('position', { ascending: true })

  if (!rows || rows.length < 2) return { ok: true }

  const idx = rows.findIndex((r) => r.id === sqId)
  if (idx === -1) return { ok: false, error: 'Questão não encontrada' }

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= rows.length) return { ok: true }

  const current = rows[idx]
  const swap = rows[swapIdx]

  await Promise.all([
    service.from('simulado_questions').update({ position: swap.position }).eq('id', current.id),
    service.from('simulado_questions').update({ position: current.position }).eq('id', swap.id),
  ])

  revalidatePath(`/simulados/${simuladoId}`)
  return { ok: true }
}

export async function searchQuestionsForSimulado(
  simuladoId: string,
  q: string
): Promise<{
  questions: { id: string; question_number: number; stem: string; exam_label: string }[]
  addedIds: string[]
}> {
  const service = createServiceClient()

  const [questionsRes, addedRes] = await Promise.all([
    (() => {
      let query = service
        .from('questions')
        .select(
          'id, question_number, stem, exams!left(year, booklet_color, exam_boards(short_name))'
        )
        .in('status', ['approved', 'published'])
        .limit(30)

      if (q.trim()) {
        query = query.textSearch('stem_tsv', q.trim(), { type: 'websearch', config: 'portuguese' })
      } else {
        query = query.order('question_number', { ascending: true })
      }

      return query
    })(),
    service
      .from('simulado_questions')
      .select('question_id')
      .eq('simulado_id', simuladoId),
  ])

  const addedIds = (addedRes.data ?? []).map((r) => r.question_id as string)

  const questions = (questionsRes.data ?? []).map((q) => {
    const exam = q.exams as unknown as {
      year: number
      booklet_color: string | null
      exam_boards: { short_name: string } | null
    } | null
    const parts = [exam?.exam_boards?.short_name, exam?.year].filter(Boolean)
    return {
      id: q.id,
      question_number: q.question_number as number,
      stem: ((q.stem ?? '') as string).slice(0, 80) + ((q.stem?.length ?? 0) > 80 ? '…' : ''),
      exam_label: parts.join(' '),
    }
  })

  return { questions, addedIds }
}
