import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { enqueueJob } from '@/lib/queue/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  question_ids?: string[]
  // Alternativa: amostrar pelos filtros do banco
  filters?: {
    modulo?: string[]
    tema?: string[]
    tipo?: string[]
    recurso?: string[]
    dificuldade?: string[]
    banca?: string[]
    year?: number[]
    status?: string[]
    classificacao?: string | null
    search?: string | null
  }
  total?: number
  mode?: 'random' | 'dificuldade' | 'tema'
}

/**
 * POST /api/teacher-tips
 * Pré-gera "Dicas para o professor" em lote, enfileirando um job por questão.
 * Aceita uma lista explícita de question_ids OU filtros (amostra via
 * sample_questions). Idempotente: o gerador pula questões que já têm dica.
 * Admin/superadmin apenas.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin'
  if (!isAdmin) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  let questionIds: string[] = Array.isArray(body.question_ids)
    ? body.question_ids.filter((s) => typeof s === 'string')
    : []

  // Sem lista explícita → amostra pelos filtros
  if (questionIds.length === 0 && body.filters) {
    const f = body.filters
    const mode = body.mode === 'tema' ? 'modulo' : body.mode === 'dificuldade' ? 'dificuldade' : 'random'
    const total = Math.max(1, Math.min(body.total ?? 50, 500))
    const { data: sample, error: rpcErr } = await service.rpc('sample_questions', {
      p_modulo: f.modulo ?? [],
      p_tema: f.tema ?? [],
      p_tipo: f.tipo ?? [],
      p_recurso: f.recurso ?? [],
      p_dificuldade: f.dificuldade ?? [],
      p_banca: f.banca ?? [],
      p_year: f.year ?? [],
      p_status: f.status ?? [],
      p_classificacao: f.classificacao ?? null,
      p_search: f.search ?? null,
      p_total: total,
      p_mode: mode,
    })
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    questionIds = ((sample ?? []) as { id: string }[]).map((r) => r.id)
  }

  if (questionIds.length === 0) {
    return NextResponse.json({ error: 'Nenhuma questão selecionada.' }, { status: 422 })
  }

  // Pula questões que já têm dica (idempotência também no enfileiramento)
  const { data: have } = await service
    .from('question_comments')
    .select('question_id')
    .eq('comment_type', 'dica_professor')
    .in('question_id', questionIds)
  const haveSet = new Set((have ?? []).map((r) => r.question_id as string))
  const missing = questionIds.filter((id) => !haveSet.has(id))

  // Evita duplicar jobs já pendentes para a mesma questão
  const { data: pending } = await service
    .from('jobs')
    .select('question_id')
    .eq('type', 'teacher_tips')
    .in('status', ['pending', 'running'])
    .in('question_id', missing)
  const pendingSet = new Set((pending ?? []).map((r) => r.question_id as string))
  const toEnqueue = missing.filter((id) => !pendingSet.has(id))

  let enqueued = 0
  for (const id of toEnqueue) {
    try {
      await enqueueJob('teacher_tips', {}, { questionId: id })
      enqueued++
    } catch {
      // ignora falha pontual de enfileiramento
    }
  }

  return NextResponse.json({
    ok: true,
    requested: questionIds.length,
    already_have: haveSet.size,
    already_pending: pendingSet.size,
    enqueued,
  })
}
