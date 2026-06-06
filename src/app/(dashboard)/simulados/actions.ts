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

type ModuloDistribution = Record<string, number>

type SimuladoFilters = {
  total: number
  originalsPct: number
  variationsPct: number
  moduloDistribution: ModuloDistribution
  statuses: string[]
}

const ALLOWED_STATUSES = ['pending_review', 'in_review', 'pending_approval', 'approved', 'published']

function pickN<T>(arr: T[], n: number): T[] {
  if (n >= arr.length) return [...arr]
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

export async function createSimuladoAction(
  formData: FormData
): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Não autenticado' }

  const title = (formData.get('title') as string)?.trim()
  if (!title) return { error: 'Título obrigatório' }

  const total = Math.max(0, parseInt((formData.get('total') as string) ?? '0', 10) || 0)
  const originalsPct = Math.max(
    0,
    Math.min(100, parseInt((formData.get('originalsPct') as string) ?? '100', 10) || 0)
  )
  const variationsPct = 100 - originalsPct

  const moduloRaw = (formData.get('moduloDistribution') as string) ?? '{}'
  let moduloDistribution: ModuloDistribution = {}
  try {
    const parsed = JSON.parse(moduloRaw)
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        const n = typeof v === 'number' ? v : parseInt(String(v), 10)
        if (Number.isFinite(n) && n > 0) moduloDistribution[k] = n
      }
    }
  } catch {
    moduloDistribution = {}
  }

  const filters: SimuladoFilters = {
    total,
    originalsPct,
    variationsPct,
    moduloDistribution,
    statuses: ALLOWED_STATUSES,
  }

  const service = createServiceClient()

  const selectedQuestionIds: string[] = []

  if (total > 0) {
    const originalsCount = Math.round((total * originalsPct) / 100)

    const moduloEntries = Object.entries(moduloDistribution)
    const sumModulo = moduloEntries.reduce((s, [, v]) => s + v, 0)

    const targetByModulo: Record<string, number> = {}
    if (sumModulo > 0) {
      let assigned = 0
      const sorted = [...moduloEntries].sort((a, b) => b[1] - a[1])
      sorted.forEach(([slug, weight], i) => {
        if (i === sorted.length - 1) {
          targetByModulo[slug] = Math.max(0, originalsCount - assigned)
        } else {
          const n = Math.round((originalsCount * weight) / sumModulo)
          targetByModulo[slug] = n
          assigned += n
        }
      })
    }

    const { data: moduloTags } = await service
      .from('tags')
      .select('id, slug')
      .eq('dimension', 'modulo')

    const slugToTagId = new Map((moduloTags ?? []).map((t) => [t.slug as string, t.id as string]))

    const usedIds = new Set<string>()

    if (sumModulo > 0) {
      for (const [slug, target] of Object.entries(targetByModulo)) {
        if (target <= 0) continue
        const tagId = slugToTagId.get(slug)
        if (!tagId) continue

        const { data: tagged } = await service
          .from('question_tags')
          .select('question_id, questions!inner(id, status)')
          .eq('tag_id', tagId)
          .in('questions.status', ALLOWED_STATUSES)

        const candidateIds = (tagged ?? [])
          .map((r) => r.question_id as string)
          .filter((id) => !usedIds.has(id))

        const picked = pickN(candidateIds, target)
        picked.forEach((id) => {
          usedIds.add(id)
          selectedQuestionIds.push(id)
        })
      }
    }

    const remaining = originalsCount - selectedQuestionIds.length
    if (remaining > 0) {
      const { data: pool } = await service
        .from('questions')
        .select('id')
        .in('status', ALLOWED_STATUSES)

      const candidateIds = (pool ?? [])
        .map((r) => r.id as string)
        .filter((id) => !usedIds.has(id))

      const picked = pickN(candidateIds, remaining)
      picked.forEach((id) => {
        usedIds.add(id)
        selectedQuestionIds.push(id)
      })
    }
  }

  const { data, error } = await service
    .from('simulados')
    .insert({
      title,
      created_by: user.id,
      filters_used: filters,
      total_questions: selectedQuestionIds.length,
    })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Falha ao criar' }

  if (selectedQuestionIds.length > 0) {
    const rows = selectedQuestionIds.map((qid, i) => ({
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
    filters,
    selected_count: selectedQuestionIds.length,
  })

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

  await Promise.all(
    orderedSqIds.map((sqId, i) =>
      service
        .from('simulado_questions')
        .update({ position: i + 1 })
        .eq('id', sqId)
        .eq('simulado_id', simuladoId)
    )
  )

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
        .in('status', ALLOWED_STATUSES)
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
