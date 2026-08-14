import type { SupabaseClient } from '@supabase/supabase-js'

// Estudo recorrente (feature 003 — B004). Helpers server-side; recebem um client
// service-role + o userId já autenticado (chamados sempre a partir do servidor
// com a sessão validada). Leituras de questões usam service (RLS de questions é
// de staff); registros de prática preservam o user_id correto.

export type PracticeQuestion = {
  id: string
  stem: string
  alternatives: Record<string, string>
}

export type ErrorCard = {
  questionId: string
  stem: string
  correctAnswer: string | null
  comment: string | null
}

type QRow = {
  id: string
  stem: string | null
  alternatives: Record<string, string> | null
  correct_answer?: string | null
  question_comments?: { content: string; comment_type: string | null }[] | null
}

function toAlternatives(q: QRow): Record<string, string> {
  const alt = (q.alternatives ?? {}) as Record<string, string>
  return {
    A: alt.A ?? '',
    B: alt.B ?? '',
    C: alt.C ?? '',
    D: alt.D ?? '',
    E: alt.E ?? '',
  }
}

/** Escolhe o comentário de explicação (ou o primeiro disponível). */
function pickComment(
  comments?: { content: string; comment_type: string | null }[] | null
): string | null {
  const list = comments ?? []
  if (list.length === 0) return null
  const explic = list.find((c) => c.comment_type === 'explicacao')
  return (explic ?? list[0])?.content ?? null
}

/** Módulos disponíveis para o filtro de prática. */
export async function getModuleTags(service: SupabaseClient) {
  const { data } = await service
    .from('tags')
    .select('id, label')
    .eq('dimension', 'modulo')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
  return (data ?? []) as { id: string; label: string }[]
}

/** Lote de questões para praticar, opcionalmente filtrado por módulo. */
export async function getPracticeBatch(
  service: SupabaseClient,
  moduleTagId: string | null,
  limit = 10
): Promise<PracticeQuestion[]> {
  let q = service
    .from('questions')
    .select(
      'id, stem, alternatives' +
        (moduleTagId ? ', question_tags!inner(tag_id)' : '')
    )
    .not('correct_answer', 'is', null)
    .limit(limit * 4)
  if (moduleTagId) q = q.eq('question_tags.tag_id', moduleTagId)

  const { data } = await q
  const rows = (data ?? []) as unknown as QRow[]
  // embaralha e corta
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rows[i], rows[j]] = [rows[j], rows[i]]
  }
  return rows.slice(0, limit).map((r) => ({
    id: r.id,
    stem: r.stem ?? '',
    alternatives: toAlternatives(r),
  }))
}

/** Gabarito + comentário publicado de uma questão (correção imediata). */
export async function getCorrection(
  service: SupabaseClient,
  questionId: string
): Promise<{ correctAnswer: string | null; comment: string | null }> {
  const { data } = await service
    .from('questions')
    .select('correct_answer, question_comments(content, comment_type)')
    .eq('id', questionId)
    // Só comentário PUBLICADO chega ao aluno — nunca rascunho de IA não revisado.
    .eq('question_comments.status', 'published')
    .single()
  const comment = pickComment(
    data?.question_comments as { content: string; comment_type: string | null }[] | null
  )
  return { correctAnswer: data?.correct_answer ?? null, comment }
}

/** Meta diária e quantas questões o aluno praticou hoje. */
export async function getGoalAndToday(
  service: SupabaseClient,
  userId: string
): Promise<{ goal: number; today: number }> {
  const { data: g } = await service
    .from('student_goals')
    .select('daily_goal')
    .eq('user_id', userId)
    .maybeSingle()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const { count } = await service
    .from('practice_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfDay.toISOString())
  return { goal: g?.daily_goal ?? 10, today: count ?? 0 }
}

/** Streak = dias consecutivos (até hoje) com prática OU simulado. */
export async function getStreak(service: SupabaseClient, userId: string): Promise<number> {
  const [{ data: pa }, { data: sa }] = await Promise.all([
    service.from('practice_attempts').select('created_at').eq('user_id', userId),
    service.from('simulado_attempts').select('started_at').eq('user_id', userId),
  ])
  const days = new Set<string>()
  for (const r of pa ?? []) days.add(new Date(r.created_at as string).toISOString().slice(0, 10))
  for (const r of sa ?? []) days.add(new Date(r.started_at as string).toISOString().slice(0, 10))
  if (days.size === 0) return 0

  let streak = 0
  const d = new Date()
  // Permite que o streak conte a partir de hoje ou ontem (se ainda não praticou hoje).
  if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1)
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

/** Módulo de menor acerto do aluno (ponto fraco), com mínimo de respostas. */
export async function getWeakestModule(
  service: SupabaseClient,
  userId: string,
  minResponses = 5
): Promise<{ tagId: string; label: string; pct: number } | null> {
  const { data } = await service
    .from('student_module_stats')
    .select('tag_id, tag_label, correct, total')
    .eq('user_id', userId)
    .eq('dimension', 'modulo')
  const rows = (data ?? [])
    .filter((r) => (r.total ?? 0) >= minResponses)
    .map((r) => ({
      tagId: r.tag_id as string,
      label: (r.tag_label as string) ?? '—',
      pct: r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0,
    }))
    .sort((a, b) => a.pct - b.pct)
  return rows[0] ?? null
}

/** Cards de erro: questões erradas (prática ∪ simulado) menos as dominadas. */
export async function getErrorCards(
  service: SupabaseClient,
  userId: string,
  limit = 50
): Promise<ErrorCard[]> {
  const wrong = new Set<string>()

  const { data: pw } = await service
    .from('practice_attempts')
    .select('question_id')
    .eq('user_id', userId)
    .eq('is_correct', false)
  for (const r of pw ?? []) wrong.add(r.question_id as string)

  const { data: sw } = await service
    .from('question_attempts')
    .select('question_id, selected_alt, questions(correct_answer), simulado_attempts!inner(user_id)')
    .eq('simulado_attempts.user_id', userId)
    .not('selected_alt', 'is', null)
  for (const r of (sw ?? []) as unknown as {
    question_id: string
    selected_alt: string
    questions: { correct_answer: string | null } | null
  }[]) {
    if (r.questions?.correct_answer && r.selected_alt !== r.questions.correct_answer) {
      wrong.add(r.question_id)
    }
  }

  const { data: dismissed } = await service
    .from('student_dismissed_cards')
    .select('question_id')
    .eq('user_id', userId)
  for (const r of dismissed ?? []) wrong.delete(r.question_id as string)

  const ids = [...wrong].slice(0, limit)
  if (ids.length === 0) return []

  const { data: qs } = await service
    .from('questions')
    .select('id, stem, correct_answer, question_comments(content, comment_type)')
    .in('id', ids)
    // Só comentário PUBLICADO chega ao aluno — nunca rascunho de IA não revisado.
    .eq('question_comments.status', 'published')

  return ((qs ?? []) as unknown as QRow[]).map((q) => ({
    questionId: q.id,
    stem: q.stem ?? '',
    correctAnswer: q.correct_answer ?? null,
    comment: pickComment(q.question_comments),
  }))
}
