'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { requireUser } from '@/lib/auth/guards'

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
    .insert({ title, created_by: user.id, filters_used: {}, total_questions: 0 })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Falha ao criar' }

  await logAudit(user.id, 'simulado', data.id, 'simulado_created', null, { title })

  redirect(`/simulados/${data.id}`)
}

/* ----------------------------------------------------------------------- *
 * Gerar simulado a partir dos filtros da tela de Questões.
 * Pool = RPC search_questions(mesmos filtros). Seleção respeita quantidade
 * e proporção (aleatória / por dificuldade / por tema-módulo). O formato do
 * caderno (questoes | comentarios | ambos) é repassado ao passo de export.
 * ----------------------------------------------------------------------- */

type ProportionMode = 'random' | 'dificuldade' | 'tema'

function parseCsvField(v: FormDataEntryValue | null): string[] {
  return ((v as string) ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

export async function createSimuladoFromFiltersAction(
  formData: FormData
): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Não autenticado' }

  const title = (formData.get('title') as string)?.trim()
  if (!title) return { error: 'Título obrigatório' }

  const total = Math.max(1, parseInt((formData.get('total') as string) ?? '0', 10) || 0)
  const proportion = ((formData.get('proportion') as string) || 'random') as ProportionMode
  const format = (formData.get('format') as string) || 'comentarios' // questoes | comentarios | ambos

  // Filtros vindos da tela de Questões (CSV multivalorado).
  const modulo = parseCsvField(formData.get('modulo'))
  const tema = parseCsvField(formData.get('tema'))
  const tipo = parseCsvField(formData.get('tipo'))
  const recurso = parseCsvField(formData.get('recurso'))
  const dificuldade = parseCsvField(formData.get('dificuldade'))
  const banca = parseCsvField(formData.get('banca'))
  const year = parseCsvField(formData.get('year')).map(Number).filter((n) => !Number.isNaN(n))
  const status = parseCsvField(formData.get('status'))
  const classificacao = (formData.get('classificacao') as string) || null
  const formato = parseCsvField(formData.get('formato'))
  const search = ((formData.get('q') as string) || '').trim() || null

  const service = createServiceClient()

  // Amostragem feita no Postgres (sample_questions): contagem + sorteio
  // estratificado no banco, retornando apenas os IDs selecionados.
  // 'tema' mapeia para a dimensão 'modulo' (área temática reliably tagged).
  const mode = proportion === 'tema' ? 'modulo' : proportion // random | dificuldade | modulo
  const { data: sampleData, error: rpcErr } = await service.rpc('sample_questions', {
    p_modulo: modulo,
    p_tema: tema,
    p_tipo: tipo,
    p_recurso: recurso,
    p_dificuldade: dificuldade,
    p_banca: banca,
    p_year: year,
    p_status: status,
    p_classificacao: classificacao,
    p_formato: formato,
    p_search: search,
    p_total: total,
    p_mode: mode,
  })
  if (rpcErr) return { error: rpcErr.message }

  const selectedIds = ((sampleData ?? []) as { id: string }[]).map((r) => r.id)
  if (selectedIds.length === 0) return { error: 'Nenhuma questão corresponde aos filtros.' }

  const filters_used = {
    source: 'questoes_filtros',
    filters: { modulo, tema, tipo, recurso, dificuldade, banca, year, status, classificacao, search },
    total: selectedIds.length,
    proportion,
    format,
  }

  const { data, error } = await service
    .from('simulados')
    .insert({
      title,
      created_by: user.id,
      filters_used,
      total_questions: selectedIds.length,
    })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Falha ao criar' }

  if (selectedIds.length > 0) {
    const rows = selectedIds.map((qid, i) => ({
      simulado_id: data.id,
      question_id: qid,
      position: i + 1,
    }))
    const { error: insertErr } = await service.from('simulado_questions').insert(rows)
    if (insertErr) {
      return { error: `Simulado criado mas falhou ao adicionar questões: ${insertErr.message}` }
    }
  }

  await logAudit(user.id, 'simulado', data.id, 'simulado_created', null, {
    title,
    filters_used,
    selected_count: selectedIds.length,
  })

  redirect(`/simulados/${data.id}/exportar?fmt=${format}`)
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

  // Impede questão duplicada no mesmo simulado (UNIQUE simulado_id+question_id,
  // garantida no banco pela migration 017). Pré-checagem dá mensagem amigável.
  const { data: existing } = await service
    .from('simulado_questions')
    .select('id')
    .eq('simulado_id', simuladoId)
    .eq('question_id', questionId)
    .maybeSingle()

  if (existing) return { ok: false, error: 'Esta questão já está no simulado' }

  // Próxima posição
  const { data: lastPos } = await service
    .from('simulado_questions')
    .select('position')
    .eq('simulado_id', simuladoId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (lastPos?.position ?? 0) + 1

  const { error } = await service.from('simulado_questions').insert({
    simulado_id: simuladoId,
    question_id: questionId,
    position,
  })

  // 23505 = unique_violation (corrida rara após a pré-checagem)
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Esta questão já está no simulado' }
    return { ok: false, error: error.message }
  }

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

  // Resequencia posições atomicamente (fecha o buraco deixado pela remoção).
  // Constraint UNIQUE(simulado_id, position) é DEFERRABLE: a RPC renumera 1..n
  // num único UPDATE dentro de uma transação. Ver migration 015.
  const { error: reseqError } = await service.rpc('resequence_simulado_questions', {
    p_simulado_id: simuladoId,
  })
  if (reseqError) return { ok: false, error: reseqError.message }

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
    .select('id')
    .eq('simulado_id', simuladoId)
    .order('position', { ascending: true })

  if (!rows || rows.length < 2) return { ok: true }

  const idx = rows.findIndex((r) => r.id === sqId)
  if (idx === -1) return { ok: false, error: 'Questão não encontrada' }

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= rows.length) return { ok: true }

  // Monta a nova ordem trocando os dois elementos e delega à RPC atômica.
  const orderedIds = rows.map((r) => r.id)
  ;[orderedIds[idx], orderedIds[swapIdx]] = [orderedIds[swapIdx], orderedIds[idx]]

  const { error } = await service.rpc('reorder_simulado_questions', {
    p_simulado_id: simuladoId,
    p_ordered_ids: orderedIds,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/simulados/${simuladoId}`)
  return { ok: true }
}

export async function reorderSimuladoQuestions(
  simuladoId: string,
  orderedSqIds: string[]
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

  // Reordenação atômica via RPC (constraint DEFERRABLE). Ver migration 015.
  const { error } = await service.rpc('reorder_simulado_questions', {
    p_simulado_id: simuladoId,
    p_ordered_ids: orderedSqIds,
  })
  if (error) return { ok: false, error: error.message }

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
  const auth = await requireUser()
  if (!auth.ok) return { questions: [], addedIds: [] }
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
