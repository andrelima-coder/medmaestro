'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sanitizeHtml } from '@/lib/sanitize-html'
import { requireUser, requireReviewer } from '@/lib/auth/guards'
import { uploadFile, getQuestionImageUrls } from '@/lib/storage/signed-urls'

export type BancoFilter = {
  examId?: string
  cardType?: string
  status?: 'all' | 'approved' | 'pending'
  query?: string
  difficulty?: number | null
  modulo?: string
  tema?: string
  page?: number
  pageSize?: number
}

export type TemaOption = { slug: string; label: string }

export type BancoFlashcard = {
  id: string
  front: string
  back: string
  card_type: string | null
  difficulty: number | null
  approved: boolean
  approved_at: string | null
  created_at: string
  source_question_id: string | null
  question_number: number | null
  exam_id: string | null
  exam_label: string
  srs_due_at: string | null
  srs_reviews: number | null
}

export type BancoListResult = {
  rows: BancoFlashcard[]
  total: number
  page: number
  pageSize: number
}

const DEFAULT_PAGE_SIZE = 50

export async function listBancoFlashcards(
  filter: BancoFilter
): Promise<BancoListResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const page = Math.max(1, filter.page ?? 1)
  const pageSize = Math.max(1, Math.min(200, filter.pageSize ?? DEFAULT_PAGE_SIZE))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // Filtro por tema (tags herdadas do enunciado): Módulo e/ou Tema (edital).
  // Semântica AND quando ambos preenchidos — o flashcard precisa ter as duas tags.
  let tagFilterIds: string[] | null = null
  const wantedSlugs = [filter.modulo, filter.tema].filter(Boolean) as string[]
  if (wantedSlugs.length) {
    let acc: Set<string> | null = null
    for (const slug of wantedSlugs) {
      const ids = await flashcardIdsForTagSlug(service, slug)
      if (acc === null) {
        acc = ids
      } else {
        const prev: Set<string> = acc
        acc = new Set([...prev].filter((x) => ids.has(x)))
      }
    }
    tagFilterIds = acc === null ? [] : [...acc]
    if (tagFilterIds.length === 0) {
      return { rows: [], total: 0, page, pageSize }
    }
  }

  let allowedQuestionIds: string[] | null = null
  if (filter.examId) {
    const { data: qs } = await service
      .from('questions')
      .select('id')
      .eq('exam_id', filter.examId)
    allowedQuestionIds = (qs ?? []).map((q) => q.id as string)
    if (allowedQuestionIds.length === 0) {
      return { rows: [], total: 0, page, pageSize }
    }
  }

  let query = service
    .from('flashcards')
    .select(
      'id, front, back, card_type, difficulty, approved, approved_at, created_at, source_question_id, srs_due_at, srs_reviews, questions(question_number, exam_id, exams(year, booklet_color, specialties(name)))',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filter.status === 'approved') query = query.eq('approved', true)
  else if (filter.status === 'pending') query = query.eq('approved', false)

  if (filter.cardType && filter.cardType !== 'all') {
    query = query.eq('card_type', filter.cardType)
  }
  if (filter.difficulty != null) {
    query = query.eq('difficulty', filter.difficulty)
  }
  if (allowedQuestionIds) {
    query = query.in('source_question_id', allowedQuestionIds)
  }
  if (tagFilterIds) {
    query = query.in('id', tagFilterIds)
  }
  if (filter.query && filter.query.trim()) {
    const q = filter.query.trim().replace(/[%_]/g, '')
    query = query.or(`front.ilike.%${q}%,back.ilike.%${q}%`)
  }

  const { data, error, count } = await query
  if (error) {
    return { rows: [], total: 0, page, pageSize }
  }

  type Row = {
    id: string
    front: string
    back: string
    card_type: string | null
    difficulty: number | null
    approved: boolean | null
    approved_at: string | null
    created_at: string
    source_question_id: string | null
    srs_due_at: string | null
    srs_reviews: number | null
    questions: {
      question_number: number | null
      exam_id: string | null
      exams: {
        year: number | null
        booklet_color: string | null
        specialties: { name: string | null } | null
      } | null
    } | null
  }

  const rows: BancoFlashcard[] = ((data ?? []) as unknown as Row[]).map((r) => {
    const exam = r.questions?.exams
    const specName = exam?.specialties?.name ?? ''
    const color = exam?.booklet_color ? ` · ${exam.booklet_color}` : ''
    const examLabel = exam ? `${specName} ${exam.year ?? ''}${color}`.trim() : '—'
    return {
      id: r.id,
      front: r.front ?? '',
      back: r.back ?? '',
      card_type: r.card_type,
      difficulty: r.difficulty,
      approved: !!r.approved,
      approved_at: r.approved_at,
      created_at: r.created_at,
      source_question_id: r.source_question_id,
      question_number: r.questions?.question_number ?? null,
      exam_id: r.questions?.exam_id ?? null,
      exam_label: examLabel,
      srs_due_at: r.srs_due_at,
      srs_reviews: r.srs_reviews,
    }
  })

  return { rows, total: count ?? rows.length, page, pageSize }
}

export async function listBancoExams(): Promise<{ id: string; label: string }[]> {
  const auth = await requireUser()
  if (!auth.ok) return []
  const service = createServiceClient()
  const { data } = await service
    .from('exams')
    .select('id, year, booklet_color, specialties(name)')
    .order('created_at', { ascending: false })
    .limit(100)
  return (data ?? []).map((e) => {
    const sp = e.specialties as unknown as { name: string } | null
    const color = e.booklet_color ? ` · ${e.booklet_color}` : ''
    return {
      id: e.id as string,
      label: `${sp?.name ?? 'Exame'} ${e.year}${color}`,
    }
  })
}

async function flashcardIdsForTagSlug(
  service: ReturnType<typeof createServiceClient>,
  slug: string
): Promise<Set<string>> {
  const { data: tagRows } = await service.from('tags').select('id').eq('slug', slug)
  const tagIds = (tagRows ?? []).map((t) => t.id as string)
  if (tagIds.length === 0) return new Set<string>()
  const { data: ft } = await service
    .from('flashcard_tags')
    .select('flashcard_id')
    .in('tag_id', tagIds)
  return new Set((ft ?? []).map((r) => r.flashcard_id as string))
}

export async function listBancoTemas(): Promise<{
  modulos: TemaOption[]
  temas: TemaOption[]
}> {
  const auth = await requireUser()
  if (!auth.ok) return { modulos: [], temas: [] }
  const service = createServiceClient()
  const [modRes, temaRes] = await Promise.all([
    service
      .from('tags')
      .select('slug, label')
      .eq('dimension', 'modulo')
      .order('display_order'),
    service
      .from('tags')
      .select('slug, label')
      .eq('dimension', 'topico_edital')
      .is('parent_tag_id', null)
      .order('display_order'),
  ])
  return {
    modulos: (modRes.data ?? []) as TemaOption[],
    temas: (temaRes.data ?? []) as TemaOption[],
  }
}

export async function updateBancoFlashcardAction(
  id: string,
  patch: { front?: string; back?: string; difficulty?: number; approved?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireReviewer()
  if (!auth.ok) return { ok: false, error: auth.error }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.front !== undefined) update.front = sanitizeHtml(patch.front).slice(0, 4000)
  if (patch.back !== undefined) update.back = sanitizeHtml(patch.back).slice(0, 8000)
  if (patch.difficulty !== undefined) {
    update.difficulty = Math.max(1, Math.min(5, Math.round(patch.difficulty)))
  }
  if (patch.approved !== undefined) {
    update.approved = patch.approved
    if (patch.approved) {
      update.approved_by = user.id
      update.approved_at = new Date().toISOString()
    } else {
      update.approved_by = null
      update.approved_at = null
    }
  }

  const { error } = await service.from('flashcards').update(update).eq('id', id)
  return { ok: !error, error: error?.message }
}

export async function deleteBancoFlashcardAction(
  id: string
): Promise<{ ok: boolean }> {
  const auth = await requireReviewer()
  if (!auth.ok) return { ok: false }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { error } = await service.from('flashcards').delete().eq('id', id)
  return { ok: !error }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Studio Anki: criação manual, upload/colagem de imagem e figuras da questão.
 * ───────────────────────────────────────────────────────────────────────── */

// ID aceito pelo proxy /api/qa-image (8–64 [a-zA-Z0-9_-]).
const OWNER_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/

/** Cria um flashcard manual (feito por humano → nasce aprovado). */
export async function createBancoFlashcardAction(input: {
  front: string
  back: string
  difficulty?: number
  cardType?: 'qa' | 'cloze'
  sourceQuestionId?: string | null
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const auth = await requireReviewer()
  if (!auth.ok) return { ok: false, error: auth.error }

  const front = sanitizeHtml(input.front ?? '').slice(0, 4000)
  const back = sanitizeHtml(input.back ?? '').slice(0, 8000)
  if (!front.trim() || !back.trim()) {
    return { ok: false, error: 'Preencha frente e verso' }
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('flashcards')
    .insert({
      source_question_id: input.sourceQuestionId ?? null,
      front,
      back,
      card_type: input.cardType === 'cloze' ? 'cloze' : 'qa',
      difficulty: Math.max(1, Math.min(5, Math.round(input.difficulty ?? 3))),
      created_by_ai: false,
      approved: true,
      approved_by: auth.user.id,
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Falha ao criar' }
  return { ok: true, id: data.id as string }
}

/**
 * Sobe uma imagem (upload ou colada) para o bucket de anexos e devolve uma URL
 * servida pelo proxy interno /api/qa-image — o ÚNICO esquema que o sanitizador
 * aceita além de data:. `ownerId` = id da questão de origem ou do card.
 */
export async function uploadFlashcardImageAction(
  ownerId: string,
  formData: FormData
): Promise<{ url?: string; error?: string }> {
  const auth = await requireReviewer()
  if (!auth.ok) return { error: auth.error }
  if (!OWNER_ID_RE.test(ownerId)) return { error: 'Destino inválido' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { error: 'Arquivo inválido' }
  if (file.size <= 0) return { error: 'Arquivo vazio' }
  if (file.size > 8 * 1024 * 1024) return { error: 'Imagem maior que 8 MB' }
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return { error: 'Formato não suportado (use PNG, JPG ou WebP)' }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const stamp = buffer.byteLength.toString(36)
  const name = `fc_${stamp}_${Math.round(buffer[0] ?? 0)}${Math.round(buffer[buffer.length - 1] ?? 0)}.${ext}`
  const path = `inline/${ownerId}/${name}`
  try {
    await uploadFile('question-attachments', path, buffer, file.type)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha no upload' }
  }
  return { url: `/api/qa-image/${path}` }
}

export type SourceFigure = { id: string; scope: string; url: string }

/** Lista as figuras da questão de origem para o seletor do editor. */
export async function listSourceFiguresAction(questionId: string): Promise<SourceFigure[]> {
  const auth = await requireReviewer()
  if (!auth.ok) return []
  if (!OWNER_ID_RE.test(questionId)) return []
  const service = createServiceClient()
  const { data } = await service
    .from('question_images')
    .select('id, image_scope, full_page_path, cropped_path, use_cropped')
    .eq('question_id', questionId)
    .order('image_scope')

  const rows = data ?? []
  const paths = rows.map((r) =>
    r.use_cropped && r.cropped_path ? (r.cropped_path as string) : (r.full_page_path as string)
  )
  if (paths.length === 0) return []
  let urls: Record<string, string> = {}
  try {
    urls = await getQuestionImageUrls(paths)
  } catch {
    urls = {}
  }
  return rows
    .map((r) => {
      const p = r.use_cropped && r.cropped_path ? (r.cropped_path as string) : (r.full_page_path as string)
      const url = urls[p]
      return url ? { id: r.id as string, scope: r.image_scope as string, url } : null
    })
    .filter((x): x is SourceFigure => x !== null)
}

/**
 * Copia uma figura da questão (bucket question-images) para o bucket de anexos
 * e devolve a URL do proxy — para embutir de forma persistente no card.
 */
export async function attachSourceFigureAction(
  questionImageId: string,
  ownerId: string
): Promise<{ url?: string; error?: string }> {
  const auth = await requireReviewer()
  if (!auth.ok) return { error: auth.error }
  if (!OWNER_ID_RE.test(ownerId)) return { error: 'Destino inválido' }

  const service = createServiceClient()
  const { data: img } = await service
    .from('question_images')
    .select('full_page_path, cropped_path, use_cropped')
    .eq('id', questionImageId)
    .single()
  if (!img) return { error: 'Figura não encontrada' }

  const srcPath = img.use_cropped && img.cropped_path
    ? (img.cropped_path as string)
    : (img.full_page_path as string)
  const ext = srcPath.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
  const ct = ext === 'png' ? 'image/png' : 'image/jpeg'

  const { data: blob, error: dlErr } = await service.storage
    .from('question-images')
    .download(srcPath)
  if (dlErr || !blob) return { error: `Falha ao ler figura: ${dlErr?.message ?? 'sem dados'}` }

  const buffer = Buffer.from(await blob.arrayBuffer())
  const destPath = `inline/${ownerId}/qfig_${questionImageId.slice(0, 8)}.${ext}`
  try {
    await uploadFile('question-attachments', destPath, buffer, ct)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao copiar figura' }
  }
  return { url: `/api/qa-image/${destPath}` }
}
