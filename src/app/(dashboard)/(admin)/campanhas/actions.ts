'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

// Campanha "Simulado Aberto para Alunos" (feature 001 — T015 + T013).
// Cria a campanha sobre um molde de simulado existente e o formulário embedável
// (campaign_form) com embed_id, consumido pelo endpoint público /api/public/leads.

export type CampaignState = { ok: boolean; error?: string; embedId?: string } | null

/**
 * Input datetime-local vem sem fuso ("YYYY-MM-DDTHH:mm"); sem tratamento o
 * Postgres interpretaria como UTC (3h de erro). Interpreta como horário de
 * Brasília (UTC-3 fixo — sem horário de verão desde 2019).
 */
function brLocalToIso(v: string | null): string | null {
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return `${v}:00-03:00`
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)) return `${v}-03:00`
  return v
}

export async function createCampaignAction(
  _prev: CampaignState,
  formData: FormData
): Promise<CampaignState> {
  const guard = await requireRole('admin')
  if (!guard.ok) return { ok: false, error: guard.error }
  const user = guard.user

  const name = (formData.get('name') as string)?.trim()
  const questionIds = ((formData.get('question_ids') as string) || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  let filtersSnapshot: Record<string, unknown> = {}
  try {
    filtersSnapshot = JSON.parse((formData.get('question_filters') as string) || '{}')
  } catch {
    filtersSnapshot = {}
  }
  const duration = Number(formData.get('duration_minutes'))
  const accessMode = (formData.get('access_mode') as string)?.trim() // imediato|data_unica|janela
  const windowStart = brLocalToIso((formData.get('window_start') as string) || null)
  const windowEnd = brLocalToIso((formData.get('window_end') as string) || null)
  const pauseAllowed = formData.get('pause_allowed') === 'on'
  const publish = formData.get('publish') === 'on'

  // Liberações.
  const releases = {
    nota_gabarito: formData.get('rel_nota') === 'on',
    comentarios_mode: (formData.get('rel_coment_mode') as string) || 'oculto', // oculto|imediato|data
    comentarios_release_at: brLocalToIso((formData.get('rel_coment_at') as string) || null),
    revisao: formData.get('rel_revisao') === 'on',
    dashboard: formData.get('rel_dashboard') === 'on', // libera o dashboard de desempenho (Fase 2)
  }

  const liveAt = brLocalToIso((formData.get('live_at') as string) || null)
  const liveUrl = (formData.get('live_url') as string)?.trim() || null

  // Rastreamento/pixel por campanha (T016).
  const tracking: Record<string, string> = {}
  const metaPixel = (formData.get('meta_pixel_id') as string)?.trim()
  const metaToken = (formData.get('meta_access_token') as string)?.trim()
  const gaId = (formData.get('ga_measurement_id') as string)?.trim()
  const gaSecret = (formData.get('ga_api_secret') as string)?.trim()
  if (metaPixel) tracking.meta_pixel_id = metaPixel
  if (metaToken) tracking.meta_access_token = metaToken
  if (gaId) tracking.ga_measurement_id = gaId
  if (gaSecret) tracking.ga_api_secret = gaSecret

  // Formulário embedável.
  const allowedDomains = ((formData.get('allowed_domains') as string) || '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
  const requireEmailVerification = formData.get('require_email_verification') === 'on'
  const extraFields = ((formData.get('extra_fields') as string) || '')
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)

  // Validações.
  if (!name) return { ok: false, error: 'O nome da campanha é obrigatório.' }
  if (questionIds.length === 0)
    return { ok: false, error: 'Selecione pelo menos uma questão para o simulado.' }
  if (!Number.isFinite(duration) || duration <= 0)
    return { ok: false, error: 'Duração inválida.' }
  if (!['imediato', 'data_unica', 'janela'].includes(accessMode))
    return { ok: false, error: 'Modo de acesso inválido.' }
  if (accessMode === 'janela' && (!windowStart || !windowEnd))
    return { ok: false, error: 'Janela exige início e fim.' }
  if (accessMode === 'janela' && windowStart && windowEnd && windowEnd <= windowStart)
    return { ok: false, error: 'O fim da janela deve ser depois do início.' }

  const service = createServiceClient()

  // Monta o simulado-molde desta campanha a partir das questões escolhidas.
  const { data: simulado, error: sErr } = await service
    .from('simulados')
    .insert({
      title: `${name} — campanha`,
      created_by: user.id,
      filters_used: filtersSnapshot,
      total_questions: questionIds.length,
    })
    .select('id')
    .single()

  if (sErr || !simulado) {
    return { ok: false, error: sErr?.message ?? 'Falha ao criar o simulado.' }
  }
  const simuladoId = simulado.id

  const sqRows = questionIds.map((qid, i) => ({
    simulado_id: simuladoId,
    question_id: qid,
    position: i + 1,
  }))
  const { error: sqErr } = await service.from('simulado_questions').insert(sqRows)
  if (sqErr) {
    return { ok: false, error: `Simulado criado, mas as questões falharam: ${sqErr.message}` }
  }

  const { data: campaign, error: cErr } = await service
    .from('campaigns')
    .insert({
      simulado_id: simuladoId,
      name,
      duration_minutes: duration,
      access_mode: accessMode,
      window_start: accessMode === 'imediato' ? null : windowStart,
      window_end: accessMode === 'janela' ? windowEnd : null,
      pause_allowed: pauseAllowed,
      releases,
      live_at: liveAt,
      live_url: liveUrl,
      tracking,
      status: publish ? 'publicada' : 'rascunho',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (cErr || !campaign) {
    return { ok: false, error: cErr?.message ?? 'Falha ao criar campanha.' }
  }

  // Campos do formulário: mínimos + extras configurados.
  const fields = [
    { key: 'name', label: 'Nome completo', type: 'text', required: true },
    { key: 'email', label: 'E-mail', type: 'email', required: true },
    { key: 'whatsapp', label: 'WhatsApp', type: 'tel', required: true },
    ...extraFields.map((label) => ({
      key: label.toLowerCase().replace(/\s+/g, '_'),
      label,
      type: 'text',
      required: false,
    })),
  ]

  const embedId = randomUUID()
  const { error: fErr } = await service.from('campaign_form').insert({
    campaign_id: campaign.id,
    fields,
    embed_id: embedId,
    allowed_domains: allowedDomains,
    require_email_verification: requireEmailVerification,
  })

  if (fErr) {
    return { ok: false, error: `Campanha criada, mas o formulário falhou: ${fErr.message}` }
  }

  await logAudit(user.id, 'campaign', campaign.id, 'campaign_created', null, {
    name,
    access_mode: accessMode,
    status: publish ? 'publicada' : 'rascunho',
  })

  revalidatePath('/campanhas')
  return { ok: true, embedId }
}

// ── Edição e publicação da campanha pós-criação ─────────────────────────────

export type CampaignReleasesConfig = {
  nota_gabarito: boolean
  comentarios_mode: 'oculto' | 'imediato' | 'data'
  comentarios_release_at: string | null
  /** Fim opcional da janela de comentários (após essa data, voltam a ficar ocultos). */
  comentarios_release_until: string | null
  revisao: boolean
  dashboard: boolean
}

export type CampaignConfig = {
  name: string
  durationMinutes: number
  accessMode: 'imediato' | 'data_unica' | 'janela'
  windowStart: string | null // ISO UTC (o client converte do datetime-local)
  windowEnd: string | null
  pauseAllowed: boolean
  liveAt: string | null
  liveUrl: string | null
  releases: CampaignReleasesConfig
}

export async function updateCampaignAction(
  campaignId: string,
  cfg: CampaignConfig
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole('admin')
  if (!guard.ok) return { ok: false, error: guard.error }

  const name = cfg.name?.trim()
  if (!name) return { ok: false, error: 'O nome da campanha é obrigatório.' }
  if (!Number.isFinite(cfg.durationMinutes) || cfg.durationMinutes <= 0)
    return { ok: false, error: 'Duração inválida.' }
  if (!['imediato', 'data_unica', 'janela'].includes(cfg.accessMode))
    return { ok: false, error: 'Modo de acesso inválido.' }
  if (cfg.accessMode === 'data_unica' && !cfg.windowStart)
    return { ok: false, error: 'Informe a data de início da prova.' }
  if (cfg.accessMode === 'janela') {
    if (!cfg.windowStart || !cfg.windowEnd)
      return { ok: false, error: 'A janela exige data de início e de fim.' }
    if (new Date(cfg.windowEnd).getTime() <= new Date(cfg.windowStart).getTime())
      return { ok: false, error: 'O fim da janela deve ser depois do início.' }
  }
  const rel = cfg.releases
  if (!['oculto', 'imediato', 'data'].includes(rel.comentarios_mode))
    return { ok: false, error: 'Modo de liberação de comentários inválido.' }
  if (rel.comentarios_mode === 'data' && !rel.comentarios_release_at)
    return { ok: false, error: 'Informe a data de liberação dos comentários.' }
  if (
    rel.comentarios_release_at &&
    rel.comentarios_release_until &&
    new Date(rel.comentarios_release_until).getTime() <=
      new Date(rel.comentarios_release_at).getTime()
  )
    return { ok: false, error: 'O fim da janela de comentários deve ser depois do início.' }

  const service = createServiceClient()
  const { error } = await service
    .from('campaigns')
    .update({
      name,
      duration_minutes: Math.round(cfg.durationMinutes),
      access_mode: cfg.accessMode,
      window_start: cfg.accessMode === 'imediato' ? null : cfg.windowStart,
      window_end: cfg.accessMode === 'janela' ? cfg.windowEnd : null,
      pause_allowed: cfg.pauseAllowed,
      live_at: cfg.liveAt,
      live_url: cfg.liveUrl?.trim() || null,
      releases: {
        nota_gabarito: rel.nota_gabarito,
        comentarios_mode: rel.comentarios_mode,
        comentarios_release_at:
          rel.comentarios_mode === 'data' ? rel.comentarios_release_at : null,
        comentarios_release_until:
          rel.comentarios_mode === 'oculto' ? null : rel.comentarios_release_until,
        revisao: rel.revisao,
        dashboard: rel.dashboard,
      },
    })
    .eq('id', campaignId)

  if (error) return { ok: false, error: error.message }

  await logAudit(guard.user.id, 'campaign', campaignId, 'campaign_updated', null, {
    access_mode: cfg.accessMode,
    pause_allowed: cfg.pauseAllowed,
    comentarios_mode: rel.comentarios_mode,
  })

  revalidatePath(`/campanhas/${campaignId}`)
  revalidatePath('/campanhas')
  return { ok: true }
}

/** Publica ou despublica a campanha (a criação podia deixá-la presa em rascunho). */
export async function setCampaignStatusAction(
  campaignId: string,
  publish: boolean
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole('admin')
  if (!guard.ok) return { ok: false, error: guard.error }

  const service = createServiceClient()

  if (publish) {
    const { data: camp } = await service
      .from('campaigns')
      .select('simulado_id')
      .eq('id', campaignId)
      .single()
    if (!camp) return { ok: false, error: 'Campanha não encontrada.' }
    const { count } = await service
      .from('simulado_questions')
      .select('id', { count: 'exact', head: true })
      .eq('simulado_id', camp.simulado_id)
    if (!count) return { ok: false, error: 'A campanha não tem questões — adicione antes de publicar.' }
  }

  const { error } = await service
    .from('campaigns')
    .update({ status: publish ? 'publicada' : 'despublicada' })
    .eq('id', campaignId)
  if (error) return { ok: false, error: error.message }

  await logAudit(guard.user.id, 'campaign', campaignId, 'campaign_status_changed', null, {
    status: publish ? 'publicada' : 'despublicada',
  })

  revalidatePath(`/campanhas/${campaignId}`)
  revalidatePath('/campanhas')
  return { ok: true }
}

// ── Formulário embedável: edição pós-criação (seção "Formulário" na campanha) ──

export type CampaignFormField = {
  key: string
  label: string
  type: string
  required: boolean
}

export type CampaignFormSettings = {
  extraFields: { label: string; required: boolean }[]
  allowedDomains: string[]
  requireEmailVerification: boolean
  /** Perguntar no embed se o lead já é aluno do produto (grava leads.segment). */
  askSegment: boolean
}

const BASE_FORM_FIELDS: CampaignFormField[] = [
  { key: 'name', label: 'Nome completo', type: 'text', required: true },
  { key: 'email', label: 'E-mail', type: 'email', required: true },
  { key: 'whatsapp', label: 'WhatsApp', type: 'tel', required: true },
]

function buildFormFields(extras: { label: string; required: boolean }[]): CampaignFormField[] {
  return [
    ...BASE_FORM_FIELDS,
    ...extras
      .map((f) => ({ label: f.label.trim(), required: f.required }))
      .filter((f) => f.label)
      .map((f) => ({
        key: f.label
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, ''),
        label: f.label,
        type: 'text',
        required: f.required,
      }))
      .filter((f) => f.key && !['name', 'email', 'whatsapp'].includes(f.key)),
  ]
}

function cleanDomains(domains: string[]): string[] {
  return [...new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean))]
}

export async function updateCampaignFormAction(
  campaignId: string,
  settings: CampaignFormSettings
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole('admin')
  if (!guard.ok) return { ok: false, error: guard.error }

  const service = createServiceClient()
  const { data, error } = await service
    .from('campaign_form')
    .update({
      fields: buildFormFields(settings.extraFields),
      allowed_domains: cleanDomains(settings.allowedDomains),
      require_email_verification: settings.requireEmailVerification,
      ask_segment: settings.askSegment,
    })
    .eq('campaign_id', campaignId)
    .select('embed_id')

  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: 'Esta campanha não tem formulário.' }

  await logAudit(guard.user.id, 'campaign', campaignId, 'campaign_form_updated', null, {
    require_email_verification: settings.requireEmailVerification,
    allowed_domains: cleanDomains(settings.allowedDomains),
    extra_fields: settings.extraFields.length,
  })

  revalidatePath(`/campanhas/${campaignId}`)
  return { ok: true }
}

/** Cria o campaign_form para campanhas antigas criadas sem o gerador. */
export async function createCampaignFormAction(
  campaignId: string
): Promise<{ ok: boolean; embedId?: string; error?: string }> {
  const guard = await requireRole('admin')
  if (!guard.ok) return { ok: false, error: guard.error }

  const service = createServiceClient()
  const embedId = randomUUID()
  const { error } = await service.from('campaign_form').insert({
    campaign_id: campaignId,
    fields: BASE_FORM_FIELDS,
    embed_id: embedId,
    allowed_domains: [],
    require_email_verification: false,
  })
  if (error) return { ok: false, error: error.message }

  await logAudit(guard.user.id, 'campaign', campaignId, 'campaign_form_created', null, {
    embed_id: embedId,
  })

  revalidatePath(`/campanhas/${campaignId}`)
  return { ok: true, embedId }
}

export async function listSimuladosForSelect() {
  if (!(await requireRole('admin')).ok) return []
  const service = createServiceClient()
  const { data } = await service
    .from('simulados')
    .select('id, title')
    .order('created_at', { ascending: false })
    .limit(200)
  return data ?? []
}

// ── Seletor de questões na criação da campanha ──────────────────────────────

export type PickerOptions = {
  modulos: { id: string; label: string }[]
  especialidades: { id: string; name: string }[]
  provas: { id: string; label: string; year: number | null }[]
  anos: number[]
}

export async function getPickerOptions(): Promise<PickerOptions> {
  if (!(await requireRole('admin')).ok) return { modulos: [], especialidades: [], provas: [], anos: [] }
  const service = createServiceClient()
  const [{ data: modulos }, { data: especialidades }, { data: provas }] = await Promise.all([
    service
      .from('tags')
      .select('id, label')
      .eq('dimension', 'modulo')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    service.from('specialties').select('id, name').order('name', { ascending: true }),
    service
      .from('exams')
      .select('id, year, specialties(name), bancas(nome_curto)')
      .order('year', { ascending: false })
      .limit(500),
  ])

  const provasList = ((provas ?? []) as unknown as {
    id: string
    year: number | null
    specialties: { name: string } | null
    bancas: { nome_curto: string } | null
  }[]).map((e) => ({
    id: e.id,
    year: e.year ?? null,
    label: `${e.specialties?.name ?? 'Prova'}${e.year ? ' ' + e.year : ''}${
      e.bancas?.nome_curto ? ' · ' + e.bancas.nome_curto : ''
    }`,
  }))

  const anos = [...new Set(provasList.map((p) => p.year).filter((y): y is number => y != null))].sort(
    (a, b) => b - a
  )

  return {
    modulos: (modulos ?? []) as { id: string; label: string }[],
    especialidades: (especialidades ?? []) as { id: string; name: string }[],
    provas: provasList,
    anos,
  }
}

export type QSearchFilter = {
  moduloTagId?: string | null
  examId?: string | null
  specialtyId?: string | null
  year?: number | null
  onlyReady?: boolean // só com gabarito + comentário
}

export type QSearchResult = {
  id: string
  number: number | null
  stem: string
  examLabel: string
  hasComment: boolean
  hasAnswer: boolean
}

export type QuestionPreview = {
  stem: string
  alternatives: Record<string, string>
  correctAnswer: string | null
  comments: { type: string; content: string }[]
}

export type SimuladoSeed = { name: string; questions: QSearchResult[] }

/**
 * Semeia a nova campanha a partir de um simulado existente ("Disponibilizar
 * para alunos" na página do simulado): mesmas questões, na mesma ordem.
 */
export async function getSimuladoSeed(simuladoId: string): Promise<SimuladoSeed | null> {
  if (!(await requireRole('admin')).ok) return null
  const service = createServiceClient()
  const [{ data: sim }, { data: sq }] = await Promise.all([
    service.from('simulados').select('title').eq('id', simuladoId).single(),
    service
      .from('simulado_questions')
      .select(
        'position, questions(id, question_number, stem, status, correct_answer, question_comments(id), exams(year, specialties(name)))'
      )
      .eq('simulado_id', simuladoId)
      .order('position', { ascending: true }),
  ])
  if (!sim || !sq) return null
  // Mesmo crivo da busca: questão rejeitada/quebrada de um simulado antigo não
  // pode ser semeada silenciosamente numa campanha para alunos.
  const BLOCKED = new Set(['rejected', 'draft', 'flagged', 'pending_extraction', 'needs_attention'])
  const questions = (sq as unknown as {
    questions: {
      id: string
      question_number: number | null
      stem: string | null
      status: string | null
      correct_answer: string | null
      question_comments: { id: string }[] | null
      exams: { year: number | null; specialties: { name: string } | null } | null
    } | null
  }[])
    .map((r) => r.questions)
    .filter((q): q is NonNullable<typeof q> => !!q && !BLOCKED.has(q.status ?? ''))
    .map((q) => ({
      id: q.id,
      number: q.question_number,
      stem: ((q.stem ?? '') as string).slice(0, 140),
      examLabel: [q.exams?.specialties?.name, q.exams?.year].filter(Boolean).join(' ') || '—',
      hasComment: (q.question_comments?.length ?? 0) > 0,
      hasAnswer: q.correct_answer != null,
    }))
  return { name: sim.title as string, questions }
}

/** Detalhe completo de uma questão para conferência antes de incluir. */
export async function getQuestionPreviewAction(
  questionId: string
): Promise<QuestionPreview | null> {
  if (!(await requireRole('admin')).ok) return null
  const service = createServiceClient()
  const { data } = await service
    .from('questions')
    .select('stem, alternatives, correct_answer, question_comments(content, comment_type)')
    .eq('id', questionId)
    .single()
  if (!data) return null
  return {
    stem: (data.stem as string | null) ?? '',
    alternatives: (data.alternatives as Record<string, string> | null) ?? {},
    correctAnswer: (data.correct_answer as string | null) ?? null,
    comments: ((data.question_comments as { content: string; comment_type: string | null }[] | null) ?? []).map(
      (c) => ({ type: c.comment_type ?? '', content: c.content ?? '' })
    ),
  }
}

export async function searchQuestionsAction(filter: QSearchFilter): Promise<QSearchResult[]> {
  if (!(await requireRole('admin')).ok) return []
  const service = createServiceClient()

  const needExamInner = !!(filter.specialtyId || filter.year)
  const examSel = needExamInner
    ? 'exams!inner(year, specialty_id, specialties(name))'
    : 'exams(year, specialty_id, specialties(name))'

  const sel =
    'id, question_number, stem, correct_answer, exam_id, question_comments(id), ' +
    examSel +
    (filter.moduloTagId ? ', question_tags!inner(tag_id)' : '')

  let q = service.from('questions').select(sel).limit(500)
  if (filter.examId) q = q.eq('exam_id', filter.examId)
  if (filter.specialtyId) q = q.eq('exams.specialty_id', filter.specialtyId)
  if (filter.year) q = q.eq('exams.year', filter.year)
  if (filter.moduloTagId) q = q.eq('question_tags.tag_id', filter.moduloTagId)

  const { data } = await q

  const seen = new Set<string>()
  const out: QSearchResult[] = []
  for (const r of (data ?? []) as unknown as {
    id: string
    question_number: number | null
    stem: string | null
    correct_answer: string | null
    question_comments: { id: string }[] | null
    exams: { year: number | null; specialties: { name: string } | null } | null
  }[]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    const hasComment = (r.question_comments?.length ?? 0) > 0
    const hasAnswer = r.correct_answer != null
    if (filter.onlyReady && !(hasComment && hasAnswer)) continue
    const exam = r.exams
    out.push({
      id: r.id,
      number: r.question_number ?? null,
      stem: (r.stem ?? '').slice(0, 140),
      examLabel: exam
        ? `${exam.specialties?.name ?? 'Prova'}${exam.year ? ' ' + exam.year : ''}`
        : '—',
      hasComment,
      hasAnswer,
    })
  }
  return out
}

// ── Dashboard de acompanhamento da campanha ─────────────────────────────────

export type CampaignDashboard = {
  cadastros: number
  iniciaram: number
  finalizaram: number
  emAndamento: number
  abandonoPct: number
  conversaoPct: number // cadastros -> iniciaram
  mediaPct: number | null
  tempoMedioSeg: number | null
  totalQuestoes: number
  distribuicao: { faixa: string; n: number }[]
  finalizacoes: { nome: string; scorePct: number; tempoSeg: number | null; finishedAt: string | null }[]
  /** Classificação completa: nota desc → menor tempo → entrega mais cedo. */
  ranking: { nome: string; scorePct: number; tempoSeg: number | null; finishedAt: string | null }[]
  /** Estatísticas por questão (para escolher o que comentar na live). */
  questoesStats: {
    questionId: string
    position: number
    number: number | null
    stem: string
    respostas: number
    erroPct: number | null // % de erro entre quem respondeu
    emBranco: number // finalizaram sem responder esta questão
    counts: Record<string, number> // cliques por alternativa
    correct: string | null
    duvidas: number
  }[]
}

export async function getCampaignDashboard(campaignId: string): Promise<CampaignDashboard> {
  if (!(await requireRole('admin')).ok) throw new Error('Sem permissão.')
  const service = createServiceClient()

  const { data: camp } = await service
    .from('campaigns')
    .select('simulado_id, duration_minutes')
    .eq('id', campaignId)
    .single()
  const simuladoId = camp?.simulado_id
  const durationSec = (camp?.duration_minutes ?? 0) * 60

  // Gabarito + metadados do molde (posição/enunciado alimentam a tabela por questão).
  const { data: sq } = await service
    .from('simulado_questions')
    .select('question_id, position, questions(question_number, stem, correct_answer)')
    .eq('simulado_id', simuladoId)
    .order('position', { ascending: true })
  const molde = (sq ?? []) as unknown as {
    question_id: string
    position: number
    questions: { question_number: number | null; stem: string | null; correct_answer: string | null } | null
  }[]
  const correctMap: Record<string, string | null> = {}
  for (const r of molde) {
    correctMap[r.question_id] = r.questions?.correct_answer ?? null
  }
  const totalQuestoes = molde.length

  // Cadastros + tentativas.
  const [{ count: cadastros }, { data: attemptsData }] = await Promise.all([
    service.from('leads').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId),
    service
      .from('simulado_attempts')
      .select('id, user_id, status, time_remaining')
      .eq('campaign_id', campaignId),
  ])
  const att = (attemptsData ?? []) as {
    id: string
    user_id: string
    status: string
    time_remaining: number | null
  }[]
  const iniciaram = att.length
  // Tempo esgotado = entrega com o que foi feito (como numa prova real):
  // expirados entram nas notas, no ranking e nas estatísticas por questão.
  const finishedAtt = att.filter((a) => a.status === 'entregue' || a.status === 'expirado')
  const finalizaram = finishedAtt.length
  const emAndamento = iniciaram - finalizaram
  const abandonoPct = iniciaram > 0 ? Math.round((emAndamento / iniciaram) * 100) : 0
  const conversaoPct =
    (cadastros ?? 0) > 0 ? Math.round((iniciaram / (cadastros ?? 1)) * 100) : 0

  // Notas reais (independem do gating do aluno) + agregados por questão.
  const finishedIds = finishedAtt.map((a) => a.id)
  const scoreByAttempt: Record<string, number> = {}
  const countsByQ: Record<string, Record<string, number>> = {}
  const respostasByQ: Record<string, number> = {}
  const errosByQ: Record<string, number> = {}
  if (finishedIds.length > 0 && totalQuestoes > 0) {
    const { data: qa } = await service
      .from('question_attempts')
      .select('attempt_id, question_id, selected_alt')
      .in('attempt_id', finishedIds)
    const correctCount: Record<string, number> = {}
    for (const r of (qa ?? []) as {
      attempt_id: string
      question_id: string
      selected_alt: string | null
    }[]) {
      const corr = correctMap[r.question_id]
      if (corr && r.selected_alt === corr) {
        correctCount[r.attempt_id] = (correctCount[r.attempt_id] ?? 0) + 1
      }
      if (r.selected_alt) {
        countsByQ[r.question_id] ??= {}
        countsByQ[r.question_id][r.selected_alt] =
          (countsByQ[r.question_id][r.selected_alt] ?? 0) + 1
        respostasByQ[r.question_id] = (respostasByQ[r.question_id] ?? 0) + 1
        if (corr && r.selected_alt !== corr) {
          errosByQ[r.question_id] = (errosByQ[r.question_id] ?? 0) + 1
        }
      }
    }
    for (const id of finishedIds) {
      scoreByAttempt[id] = Math.round(((correctCount[id] ?? 0) / totalQuestoes) * 100)
    }
  }

  // Dúvidas por questão (enviadas para a live).
  const duvidasByQ: Record<string, number> = {}
  {
    const { data: doubts } = await service
      .from('question_doubts')
      .select('question_id')
      .eq('campaign_id', campaignId)
    for (const d of (doubts ?? []) as { question_id: string }[]) {
      duvidasByQ[d.question_id] = (duvidasByQ[d.question_id] ?? 0) + 1
    }
  }
  const scores = finishedIds.map((id) => scoreByAttempt[id] ?? 0)
  const mediaPct =
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

  // Tempo gasto = duração − tempo restante (em segundos), só p/ finalizadas.
  const tempoByAttempt: Record<string, number | null> = {}
  for (const a of finishedAtt) {
    const rem = a.time_remaining ?? null
    tempoByAttempt[a.id] = durationSec > 0 && rem != null ? Math.max(0, durationSec - rem) : null
  }
  const tempos = finishedAtt
    .map((a) => tempoByAttempt[a.id])
    .filter((t): t is number => t != null)
  const tempoMedioSeg =
    tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null

  // Distribuição de notas.
  const faixas: [string, number, number][] = [
    ['0–20', 0, 20],
    ['21–40', 21, 40],
    ['41–60', 41, 60],
    ['61–80', 61, 80],
    ['81–100', 81, 100],
  ]
  const distribuicao = faixas.map(([faixa, lo, hi]) => ({
    faixa,
    n: scores.filter((s) => s >= lo && s <= hi).length,
  }))

  // Finalizações (com nome e horário) — ordem decrescente de término.
  const { data: res } =
    finishedIds.length > 0
      ? await service
          .from('attempt_results')
          .select('attempt_id, finished_at')
          .in('attempt_id', finishedIds)
      : { data: [] as { attempt_id: string; finished_at: string | null }[] }
  const finAtMap: Record<string, string | null> = {}
  for (const r of (res ?? []) as { attempt_id: string; finished_at: string | null }[]) {
    finAtMap[r.attempt_id] = r.finished_at
  }

  const userIds = [...new Set(finishedAtt.map((a) => a.user_id))]
  const { data: profs } =
    userIds.length > 0
      ? await service.from('profiles').select('id, full_name').in('id', userIds)
      : { data: [] as { id: string; full_name: string | null }[] }
  const nameMap: Record<string, string> = {}
  for (const p of (profs ?? []) as { id: string; full_name: string | null }[]) {
    nameMap[p.id] = p.full_name ?? '—'
  }

  const linhas = finishedAtt.map((a) => ({
    nome: nameMap[a.user_id] ?? 'Aluno',
    scorePct: scoreByAttempt[a.id] ?? 0,
    tempoSeg: tempoByAttempt[a.id] ?? null,
    finishedAt: finAtMap[a.id] ?? null,
  }))

  const finalizacoes = [...linhas]
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
    .slice(0, 50)

  // Ranking determinístico: nota desc → menor tempo (sem tempo vai por último) →
  // entrega mais cedo.
  const ranking = [...linhas].sort((a, b) => {
    if (b.scorePct !== a.scorePct) return b.scorePct - a.scorePct
    const ta = a.tempoSeg ?? Number.MAX_SAFE_INTEGER
    const tb = b.tempoSeg ?? Number.MAX_SAFE_INTEGER
    if (ta !== tb) return ta - tb
    return (a.finishedAt ?? '9999').localeCompare(b.finishedAt ?? '9999')
  })

  const questoesStats = molde.map((r) => {
    const respostas = respostasByQ[r.question_id] ?? 0
    const erros = errosByQ[r.question_id] ?? 0
    return {
      questionId: r.question_id,
      position: r.position,
      number: r.questions?.question_number ?? null,
      stem: (r.questions?.stem ?? '').slice(0, 120),
      respostas,
      erroPct: respostas > 0 ? Math.round((erros / respostas) * 100) : null,
      emBranco: Math.max(0, finalizaram - respostas),
      counts: countsByQ[r.question_id] ?? {},
      correct: correctMap[r.question_id] ?? null,
      duvidas: duvidasByQ[r.question_id] ?? 0,
    }
  })

  return {
    cadastros: cadastros ?? 0,
    iniciaram,
    finalizaram,
    emAndamento,
    abandonoPct,
    conversaoPct,
    mediaPct,
    tempoMedioSeg,
    totalQuestoes,
    distribuicao,
    finalizacoes,
    ranking,
    questoesStats,
  }
}
