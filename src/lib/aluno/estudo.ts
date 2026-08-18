import type { SupabaseClient } from '@supabase/supabase-js'
import { getQuestionImageUrls } from '@/lib/storage/signed-urls'

// Estudo recorrente (feature 003 — B004). Helpers server-side; recebem um client
// service-role + o userId já autenticado (chamados sempre a partir do servidor
// com a sessão validada). Leituras de questões usam service (RLS de questions é
// de staff); registros de prática preservam o user_id correto.

export type PracticeQuestion = {
  id: string
  stem: string
  alternatives: Record<string, string>
}

export type ErrorCardComment = { type: string | null; content: string }
export type ErrorCardImage = { url: string; scope: string }

export type ErrorCard = {
  questionId: string
  stem: string
  alternatives: Record<string, string>
  correctAnswer: string | null
  /** Última alternativa errada que o aluno marcou (prática ou simulado). */
  selectedAlt: string | null
  comments: ErrorCardComment[]
  images: ErrorCardImage[]
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
  // Questão sem enunciado ou sem pelo menos 2 alternativas com texto é um beco
  // sem saída na Prática (não há como responder nem pular) — fica fora do
  // sorteio. Atenção: toAlternatives() preenche A–E com '' — conte só as
  // alternativas de verdade, direto do JSONB.
  const rows = ((data ?? []) as unknown as QRow[]).filter(
    (r) =>
      (r.stem ?? '').trim() !== '' &&
      Object.values((r.alternatives ?? {}) as Record<string, string>).filter(
        (v) => typeof v === 'string' && v.trim() !== ''
      ).length >= 2
  )
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
    // Comentário rejeitado pela curadoria nunca chega ao aluno. (O CHECK real da
    // coluna é draft/approved/rejected — 'published' não existe e escondia tudo.)
    .neq('question_comments.status', 'rejected')
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
  // questionId → alternativa errada marcada (a mais recente que conseguirmos apurar)
  const wrong = new Map<string, string | null>()

  // Simulado primeiro: se a questão também foi errada na prática, a prática
  // (abaixo, ordenada por data) sobrescreve com a marcação mais recente.
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
      wrong.set(r.question_id, r.selected_alt)
    }
  }

  const { data: pw } = await service
    .from('practice_attempts')
    .select('question_id, selected_alt, created_at')
    .eq('user_id', userId)
    .eq('is_correct', false)
    .order('created_at', { ascending: true })
  for (const r of pw ?? []) {
    wrong.set(r.question_id as string, (r.selected_alt as string | null) ?? null)
  }

  const { data: dismissed } = await service
    .from('student_dismissed_cards')
    .select('question_id')
    .eq('user_id', userId)
  for (const r of dismissed ?? []) wrong.delete(r.question_id as string)

  const ids = [...wrong.keys()].slice(0, limit)
  if (ids.length === 0) return []

  const { data: qs } = await service
    .from('questions')
    .select('id, stem, alternatives, correct_answer, question_comments(content, comment_type)')
    .in('id', ids)
    // Comentário rejeitado pela curadoria nunca chega ao aluno. (O CHECK real da
    // coluna é draft/approved/rejected — 'published' não existe e escondia tudo.)
    .neq('question_comments.status', 'rejected')

  const imagesByQuestion = await getErrorCardImages(service, ids)

  return ((qs ?? []) as unknown as QRow[]).map((q) => ({
    questionId: q.id,
    stem: q.stem ?? '',
    alternatives: toAlternatives(q),
    correctAnswer: q.correct_answer ?? null,
    selectedAlt: wrong.get(q.id) ?? null,
    comments: sortComments(q.question_comments),
    images: imagesByQuestion.get(q.id) ?? [],
  }))
}

/** Todos os comentários publicados, com a explicação em primeiro. */
function sortComments(
  comments?: { content: string; comment_type: string | null }[] | null
): ErrorCardComment[] {
  const list = (comments ?? []).map((c) => ({ type: c.comment_type, content: c.content }))
  return [
    ...list.filter((c) => c.type === 'explicacao'),
    ...list.filter((c) => c.type !== 'explicacao'),
  ]
}

const IMAGE_SCOPE_ORDER = [
  'statement',
  'alternative_a',
  'alternative_b',
  'alternative_c',
  'alternative_d',
  'alternative_e',
]

/** Imagens das questões com signed URLs, agrupadas por questão. */
export async function getErrorCardImages(
  service: SupabaseClient,
  questionIds: string[]
): Promise<Map<string, ErrorCardImage[]>> {
  const result = new Map<string, ErrorCardImage[]>()

  const { data: imgs } = await service
    .from('question_images')
    .select('question_id, image_scope, full_page_path, cropped_path, use_cropped, figure_number')
    .in('question_id', questionIds)
  const rows = ((imgs ?? []) as unknown as {
    question_id: string
    image_scope: string | null
    full_page_path: string
    cropped_path: string | null
    use_cropped: boolean | null
    figure_number: number | null
  }[]).map((r) => ({
    questionId: r.question_id,
    scope: r.image_scope ?? 'statement',
    path: r.use_cropped && r.cropped_path ? r.cropped_path : r.full_page_path,
    figure: r.figure_number ?? 0,
  }))
  if (rows.length === 0) return result

  // Imagem é acessório do card: se a assinatura falhar, o card sai sem figura
  // em vez de derrubar a página inteira.
  let urls: Record<string, string> = {}
  try {
    urls = await getQuestionImageUrls([...new Set(rows.map((r) => r.path))])
  } catch {
    return result
  }

  rows.sort(
    (a, b) =>
      IMAGE_SCOPE_ORDER.indexOf(a.scope) - IMAGE_SCOPE_ORDER.indexOf(b.scope) ||
      a.figure - b.figure
  )
  for (const r of rows) {
    const url = urls[r.path]
    if (!url) continue
    const list = result.get(r.questionId) ?? []
    list.push({ url, scope: r.scope })
    result.set(r.questionId, list)
  }
  return result
}

export type ModuloDesempenho = {
  tagId: string
  slug: string
  label: string
  pct: number | null
  total: number
}

/** Todos os módulos do edital com o desempenho do aluno em cada um (Fase 3 — página Módulos). */
export async function getModulosComDesempenho(
  service: SupabaseClient,
  userId: string
): Promise<ModuloDesempenho[]> {
  const [{ data: tags }, { data: stats }] = await Promise.all([
    service
      .from('tags')
      .select('id, slug, label')
      .eq('dimension', 'modulo')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    service
      .from('student_module_stats')
      .select('tag_id, correct, total')
      .eq('user_id', userId)
      .eq('dimension', 'modulo'),
  ])
  const byTag = new Map(
    (stats ?? []).map((s) => [s.tag_id as string, s as { correct: number; total: number }])
  )
  return (tags ?? []).map((t) => {
    const s = byTag.get(t.id as string)
    const total = s?.total ?? 0
    const correct = s?.correct ?? 0
    return {
      tagId: t.id as string,
      slug: t.slug as string,
      label: t.label as string,
      pct: total > 0 ? Math.round((correct / total) * 100) : null,
      total,
    }
  })
}

export type SimuladoDisponivel = {
  campaignId: string
  nome: string
  totalQuestoes: number | null
  /** Situação da janela de acesso agora. */
  janela: 'aberto' | 'aguardando' | 'encerrado'
  abreEm: string | null
  encerraEm: string | null
}

/**
 * Campanhas publicadas com a situação da janela de acesso. `onlyCampaignIds`
 * restringe às campanhas de origem de uma conta de lead (porta pública).
 */
export async function getSimuladosDisponiveis(
  service: SupabaseClient,
  onlyCampaignIds?: string[]
): Promise<SimuladoDisponivel[]> {
  const nowIso = new Date().toISOString()
  let q = service
    .from('campaigns')
    .select('id, name, access_mode, window_start, window_end, simulados(total_questions)')
    .eq('status', 'publicada')
  if (onlyCampaignIds) {
    if (onlyCampaignIds.length === 0) return []
    q = q.in('id', onlyCampaignIds)
  }
  const { data } = await q
  const rows = (data ?? []) as unknown as {
    id: string
    name: string
    access_mode: string
    window_start: string | null
    window_end: string | null
    simulados: { total_questions: number | null } | null
  }[]
  return rows.map((c) => {
    let janela: SimuladoDisponivel['janela'] = 'aberto'
    if (c.access_mode !== 'imediato') {
      if (c.window_start && c.window_start > nowIso) janela = 'aguardando'
      else if (c.window_end && c.window_end < nowIso) janela = 'encerrado'
    }
    return {
      campaignId: c.id,
      nome: c.name,
      totalQuestoes: c.simulados?.total_questions ?? null,
      janela,
      abreEm: c.access_mode !== 'imediato' ? c.window_start : null,
      encerraEm: c.access_mode !== 'imediato' ? c.window_end : null,
    }
  })
}

export type MeuSimuladoAttempt = {
  campaignId: string
  nome: string
  status: 'em_andamento' | 'entregue' | 'expirado'
  startedAt: string
}

/** Tentativas do aluno (uma por campanha — prova é sempre tentativa única). */
export async function getMeusSimulados(
  service: SupabaseClient,
  userId: string
): Promise<MeuSimuladoAttempt[]> {
  const { data } = await service
    .from('simulado_attempts')
    .select('campaign_id, status, started_at, campaigns(name)')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
  const rows = (data ?? []) as unknown as {
    campaign_id: string
    status: 'em_andamento' | 'entregue' | 'expirado'
    started_at: string
    campaigns: { name: string } | null
  }[]
  return rows.map((r) => ({
    campaignId: r.campaign_id,
    nome: r.campaigns?.name ?? 'Simulado',
    status: r.status,
    startedAt: r.started_at,
  }))
}

/** Prática dos últimos 7 dias, um contador por dia (Fase 3 — página Metas). */
export async function getPracticeLast7Days(
  service: SupabaseClient,
  userId: string
): Promise<{ date: string; count: number }[]> {
  const since = new Date()
  since.setDate(since.getDate() - 6)
  since.setHours(0, 0, 0, 0)
  const { data } = await service
    .from('practice_attempts')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())

  const counts = new Map<string, number>()
  for (let i = 0; i < 7; i++) {
    const d = new Date(since)
    d.setDate(d.getDate() + i)
    counts.set(d.toISOString().slice(0, 10), 0)
  }
  for (const r of data ?? []) {
    const key = new Date(r.created_at as string).toISOString().slice(0, 10)
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([date, count]) => ({ date, count }))
}
