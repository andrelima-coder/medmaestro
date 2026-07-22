import { createServiceClient } from '@/lib/supabase/service'
import { examLabel as buildExamLabel } from '@/lib/exams/label'
import {
  buildDocxBuffer,
  buildPdfBuffer,
  buildXlsxBuffer,
  type ContentFlags,
  type ExportData,
  type QuestionData,
} from '@/lib/exports/build'

export type ExportFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx'

const MIME: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export function parseFormat(raw: string | null): ExportFormat {
  const f = (raw ?? 'docx').toLowerCase()
  return f === 'pdf' || f === 'xlsx' || f === 'pptx' ? f : 'docx'
}

/** Dispatch formato → arquivo. Compartilhado entre os routes de export. */
export async function renderExport(
  data: ExportData,
  format: ExportFormat
): Promise<{ bytes: Uint8Array; mime: string; ext: ExportFormat }> {
  let buffer: Buffer | Uint8Array
  if (format === 'pdf') {
    buffer = await buildPdfBuffer(data)
  } else if (format === 'xlsx') {
    buffer = await buildXlsxBuffer(data)
  } else if (format === 'pptx') {
    const { buildPptxBuffer } = await import('@/lib/exports/build-pptx')
    buffer = await buildPptxBuffer(data)
  } else {
    buffer = await buildDocxBuffer(data)
  }
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return { bytes, mime: MIME[format], ext: format }
}

/** Slug seguro a partir de um título, para nome de arquivo. */
export function safeFilename(title: string, fallback = 'export'): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || fallback
  )
}

/** Tipos de comentário tratados como "dica para o professor". */
export const TEACHER_TIP_TYPE = 'dica_professor'

/** Detecta image/png ou image/jpeg pelos magic bytes; null se desconhecido. */
function sniffImageMime(buf: Uint8Array): string | null {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png'
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) {
    return 'image/jpeg'
  }
  return null
}

type QuestionRow = {
  id: string
  question_number: number
  stem: string | null
  alternatives: Record<string, string> | null
  correct_answer: string | null
  exams: {
    year: number | null
    booklet_color: string | null
    exam_boards: { short_name: string | null } | null
  } | null
}

type CommentRow = {
  question_id: string
  comment_type: string
  content: string
  source: string | null
}

/**
 * Carrega os dados de exportação (questões + imagens + comentários + tags) para
 * um conjunto de question_ids, respeitando a ordem recebida.
 *
 * Compartilhado entre o export de simulado salvo e o export direto por filtros.
 * `notesByQuestion` permite injetar a nota posicional do simulado (opcional).
 */
export async function loadQuestionsForExport(
  questionIds: string[],
  content: ContentFlags,
  format: ExportFormat,
  notesByQuestion?: Map<string, string | null>
): Promise<QuestionData[]> {
  if (questionIds.length === 0) return []

  const service = createServiceClient()
  const includeImages = content.figuras && format !== 'xlsx'

  // Questões (preserva a ordem de questionIds)
  const { data: qData } = await service
    .from('questions')
    .select(
      'id, question_number, stem, alternatives, correct_answer, exams!left(year, booklet_color, exam_boards(short_name))'
    )
    .in('id', questionIds)

  const questionsById = new Map<string, QuestionRow>()
  for (const q of (qData ?? []) as unknown as QuestionRow[]) {
    questionsById.set(q.id, q)
  }

  // Imagens
  type ImgItem = {
    path: string
    cropped: string | null
    useCropped: boolean
    pageNumber: number | null
    figureNumber: number | null
    scope: string
  }
  const imagesByQuestion = new Map<string, ImgItem[]>()
  if (includeImages) {
    const { data: imgs } = await service
      .from('question_images')
      .select('question_id, full_page_path, cropped_path, use_cropped, page_number, figure_number, image_scope')
      .in('question_id', questionIds)
    for (const img of imgs ?? []) {
      const list = imagesByQuestion.get(img.question_id as string) ?? []
      list.push({
        path: img.full_page_path as string,
        cropped: (img.cropped_path as string | null) ?? null,
        useCropped: Boolean(img.use_cropped),
        pageNumber: (img.page_number as number | null) ?? null,
        figureNumber: (img.figure_number as number | null) ?? null,
        scope: (img.image_scope as string | null) ?? 'statement',
      })
      imagesByQuestion.set(img.question_id as string, list)
    }
    const SCOPE_ORDER = [
      'statement',
      'alternative_a',
      'alternative_b',
      'alternative_c',
      'alternative_d',
      'alternative_e',
    ]
    for (const [qid, list] of imagesByQuestion.entries()) {
      // Ordem estável: scope (enunciado antes das alternativas) e depois
      // figure_number. Antes misturava figure_number com page_number (escalas
      // diferentes) e a ordem das figuras podia variar entre exports.
      list.sort((a, b) => {
        const as = SCOPE_ORDER.indexOf(a.scope)
        const bs = SCOPE_ORDER.indexOf(b.scope)
        if (as !== bs) return as - bs
        return (a.figureNumber ?? 999) - (b.figureNumber ?? 999)
      })
      // Deduplica figuras que resolvem para o MESMO arquivo (ex.: duas linhas
      // sem crop apontando para a mesma página inteira) — evitava a mesma
      // página aparecer 2x no DOCX/PDF.
      const seen = new Set<string>()
      imagesByQuestion.set(
        qid,
        list.filter((img) => {
          const p = img.useCropped && img.cropped ? img.cropped : img.path
          if (seen.has(p)) return false
          seen.add(p)
          return true
        })
      )
    }
  }

  // Comentários (inclui dica_professor quando solicitado)
  const wantsComments =
    content.coment_alt || content.coment_compilado || content.referencias || content.dica_professor
  const commentsByQuestion = new Map<string, CommentRow[]>()
  if (wantsComments) {
    const { data: cmts } = await service
      .from('question_comments')
      .select('question_id, comment_type, content, source')
      .in('question_id', questionIds)
    for (const c of (cmts ?? []) as CommentRow[]) {
      const list = commentsByQuestion.get(c.question_id) ?? []
      list.push(c)
      commentsByQuestion.set(c.question_id, list)
    }
  }

  // Tags
  const tagsByQuestion = new Map<string, Array<{ label: string; dimension: string }>>()
  if (content.taxonomia) {
    const { data: qts } = await service
      .from('question_tags')
      .select('question_id, tags!inner(label, dimension)')
      .in('question_id', questionIds)
    for (const qt of qts ?? []) {
      const tag = qt as unknown as {
        question_id: string
        tags: { label: string; dimension: string }
      }
      const list = tagsByQuestion.get(tag.question_id) ?? []
      list.push({ label: tag.tags.label, dimension: tag.tags.dimension })
      tagsByQuestion.set(tag.question_id, list)
    }
  }

  // Bytes das imagens (signed URL → fetch)
  const imageBytes = new Map<string, { data: Uint8Array; contentType: string }>()
  if (includeImages && imagesByQuestion.size > 0) {
    const allPaths = new Set<string>()
    for (const list of imagesByQuestion.values()) {
      for (const img of list) {
        const p = img.useCropped && img.cropped ? img.cropped : img.path
        if (p) allPaths.add(p)
      }
    }
    const paths = Array.from(allPaths)
    const { data: signed } = await service.storage
      .from('question-images')
      .createSignedUrls(paths, 60 * 5)
    if (signed) {
      await Promise.all(
        signed.map(async (s) => {
          if (!s.signedUrl || !s.path) return
          try {
            const r = await fetch(s.signedUrl)
            if (!r.ok) return
            const ab = await r.arrayBuffer()
            const bytes = new Uint8Array(ab)
            // Tipo detectado pelos magic bytes do arquivo, não pelo header HTTP.
            // Um PNG servido como octet-stream fazia o embedJpg do PDF falhar e
            // a figura sumia do export sem aviso.
            const ct = sniffImageMime(bytes) ?? r.headers.get('content-type') ?? 'image/jpeg'
            imageBytes.set(s.path, { data: bytes, contentType: ct })
          } catch {
            // ignore
          }
        })
      )
    }
  }

  // Monta na ordem de questionIds
  const result: QuestionData[] = []
  let position = 0
  for (const qid of questionIds) {
    const q = questionsById.get(qid)
    if (!q) continue
    position += 1

    const exam = q.exams
    const examLabel = exam
      ? buildExamLabel({
          name: exam.exam_boards?.short_name,
          year: exam.year,
          bookletColor: exam.booklet_color,
        })
      : ''

    const imgs = imagesByQuestion.get(qid) ?? []
    const figures = imgs
      .map((img) => {
        const path = img.useCropped && img.cropped ? img.cropped : img.path
        const bytes = imageBytes.get(path)
        if (!bytes) return null
        return {
          data: bytes.data,
          contentType: bytes.contentType,
          figureNumber: img.figureNumber,
          scope: img.scope,
        }
      })
      .filter(
        (
          f
        ): f is {
          data: Uint8Array
          contentType: string
          figureNumber: number | null
          scope: string
        } => f !== null
      )

    const cmts = commentsByQuestion.get(qid) ?? []
    const referencias = cmts.filter((c) => c.comment_type === 'referencia')
    const teacherTips = cmts.filter((c) => c.comment_type === TEACHER_TIP_TYPE)
    const comments = cmts.filter(
      (c) => c.comment_type !== 'referencia' && c.comment_type !== TEACHER_TIP_TYPE
    )
    const tags = tagsByQuestion.get(qid) ?? []

    result.push({
      position,
      questionNumber: q.question_number,
      examLabel,
      stem: q.stem ?? '',
      alternatives: (q.alternatives ?? {}) as Record<string, string>,
      correctAnswer: q.correct_answer ?? null,
      note: notesByQuestion?.get(qid) ?? null,
      figures,
      comments,
      referencias,
      teacherTips,
      tags,
    })
  }

  return result
}
