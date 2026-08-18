'use server'

import { revalidatePath } from 'next/cache'
import { requireRole, requireSimuladoAccess } from '@/lib/auth/guards'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

// Seleção em massa no Banco de Questões → adicionar ao caderno/simulado.
// A fonte das questões do simulado é sempre este módulo de gestão de provas:
// os filtros da página definem o pool, e daqui as questões vão em lote para um
// simulado existente ou novo.

const MAX_SELECT_ALL = 5000

type FiltersInput = {
  banca?: string
  modulo?: string
  tema?: string
  tipo?: string
  recurso?: string
  dificuldade?: string
  year?: string
  status?: string
  classificacao?: string
  formato?: string
  q?: string
}

function parseList(v?: string): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * IDs de todas as questões que batem no filtro atual (todas as páginas) —
 * mesma semântica da listagem (RPC search_questions).
 */
export async function listFilteredQuestionIdsAction(
  filters: FiltersInput
): Promise<{ ok: boolean; ids: string[]; error?: string }> {
  const guard = await requireRole('analista')
  if (!guard.ok) return { ok: false, ids: [], error: guard.error }

  const service = createServiceClient()
  const { data, error } = await service.rpc('search_questions', {
    p_modulo: parseList(filters.modulo),
    p_tema: parseList(filters.tema),
    p_tipo: parseList(filters.tipo),
    p_recurso: parseList(filters.recurso),
    p_dificuldade: parseList(filters.dificuldade),
    p_banca: parseList(filters.banca),
    p_year: parseList(filters.year).map(Number).filter((n) => !Number.isNaN(n)),
    p_status: parseList(filters.status),
    p_classificacao: filters.classificacao || null,
    p_formato: parseList(filters.formato),
    p_search: filters.q?.trim() || null,
    p_limit: MAX_SELECT_ALL,
    p_offset: 0,
  })
  if (error) return { ok: false, ids: [], error: error.message }

  const result = (data?.[0] ?? { rows: [] }) as { rows: { id: string }[] | null }
  return { ok: true, ids: (result.rows ?? []).map((r) => r.id) }
}

export type SimuladoOption = { id: string; title: string; total: number }

/** Simulados que o chamador pode receber questões (dono; admin+ vê todos). */
export async function listSimuladosParaAdicionarAction(): Promise<SimuladoOption[]> {
  const guard = await requireRole('analista')
  if (!guard.ok) return []
  const service = createServiceClient()
  let q = service
    .from('simulados')
    .select('id, title, total_questions, created_by')
    .order('created_at', { ascending: false })
    .limit(100)
  if (!['admin', 'superadmin'].includes(guard.user.role)) {
    q = q.eq('created_by', guard.user.id)
  }
  const { data } = await q
  return ((data ?? []) as { id: string; title: string; total_questions: number | null }[]).map(
    (s) => ({ id: s.id, title: s.title, total: s.total_questions ?? 0 })
  )
}

export type AddBulkResult =
  | { ok: true; simuladoId: string; added: number; skipped: number }
  | { ok: false; error: string }

/**
 * Adiciona questões em lote a um simulado existente ou novo. Duplicatas são
 * ignoradas (UNIQUE(simulado_id, question_id) já existe em produção) e as
 * posições continuam a sequência atual.
 */
export async function addQuestionsToSimuladoBulkAction(input: {
  simuladoId?: string | null
  newTitle?: string | null
  questionIds: string[]
}): Promise<AddBulkResult> {
  const guard = await requireRole('analista')
  if (!guard.ok) return { ok: false, error: guard.error }

  const questionIds = [...new Set(input.questionIds)].filter(Boolean)
  if (questionIds.length === 0) return { ok: false, error: 'Nenhuma questão selecionada.' }
  if (questionIds.length > MAX_SELECT_ALL)
    return { ok: false, error: `Máximo de ${MAX_SELECT_ALL} questões por vez.` }

  const service = createServiceClient()
  let simuladoId = input.simuladoId?.trim() || null

  if (simuladoId) {
    const { data: sim } = await service
      .from('simulados')
      .select('id, created_by')
      .eq('id', simuladoId)
      .single()
    if (!sim) return { ok: false, error: 'Simulado não encontrado.' }
    const access = await requireSimuladoAccess(sim.created_by as string | null)
    if (!access.ok) return { ok: false, error: access.error }

    // Simulado de campanha publicada não pode mudar no meio da aplicação —
    // o denominador da nota mudaria retroativamente para quem já fez.
    const { data: liveCampaign } = await service
      .from('campaigns')
      .select('id, name')
      .eq('simulado_id', simuladoId)
      .eq('status', 'publicada')
      .limit(1)
      .maybeSingle()
    if (liveCampaign) {
      return {
        ok: false,
        error: `Este simulado está vinculado à campanha publicada "${liveCampaign.name}". Despublique a campanha antes de alterar as questões.`,
      }
    }
  } else {
    const title = input.newTitle?.trim()
    if (!title) return { ok: false, error: 'Dê um nome ao novo simulado.' }
    const { data: created, error } = await service
      .from('simulados')
      .insert({
        title,
        created_by: guard.user.id,
        filters_used: { origem: 'selecao_massa_questoes' },
        total_questions: 0,
      })
      .select('id')
      .single()
    if (error || !created) return { ok: false, error: error?.message ?? 'Falha ao criar o simulado.' }
    simuladoId = created.id as string
  }

  // Dedupe contra o que já está no simulado.
  const { data: existing } = await service
    .from('simulado_questions')
    .select('question_id, position')
    .eq('simulado_id', simuladoId)
  const existingIds = new Set((existing ?? []).map((r) => r.question_id as string))
  const maxPos = Math.max(0, ...((existing ?? []).map((r) => (r.position as number) ?? 0)))

  const newIds = questionIds.filter((id) => !existingIds.has(id))
  const skipped = questionIds.length - newIds.length

  if (newIds.length > 0) {
    const rows = newIds.map((qid, i) => ({
      simulado_id: simuladoId,
      question_id: qid,
      position: maxPos + 1 + i,
    }))
    // upsert ignorando duplicatas: corrida entre dois staff (ou double-click)
    // não derruba o lote inteiro no UNIQUE(simulado_id, question_id).
    const { error: insErr } = await service
      .from('simulado_questions')
      .upsert(rows, { onConflict: 'simulado_id,question_id', ignoreDuplicates: true })
    if (insErr) return { ok: false, error: `Falha ao adicionar questões: ${insErr.message}` }

    // Recontagem real (não aritmética de leitura possivelmente velha).
    const { count } = await service
      .from('simulado_questions')
      .select('id', { count: 'exact', head: true })
      .eq('simulado_id', simuladoId)
    await service
      .from('simulados')
      .update({ total_questions: count ?? existingIds.size + newIds.length })
      .eq('id', simuladoId)
  }

  await logAudit(guard.user.id, 'simulado', simuladoId, 'bulk_questions_added', null, {
    added: newIds.length,
    skipped,
  })

  revalidatePath(`/simulados/${simuladoId}`)
  revalidatePath('/simulados')
  return { ok: true, simuladoId, added: newIds.length, skipped }
}
