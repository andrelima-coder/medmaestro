import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  buildDocxBuffer,
  buildPdfBuffer,
  buildXlsxBuffer,
  type ExportData,
  type ContentFlags,
} from '@/lib/exports/build'
import { uploadFile, getExportUrl } from '@/lib/storage/signed-urls'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function flag(value: string | null, defaultValue: boolean): boolean {
  if (value == null) return defaultValue
  return value === '1' || value === 'true'
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const service = createServiceClient()

  const { data: simulado } = await service
    .from('simulados')
    .select('id, title, created_by, filters_used')
    .eq('id', id)
    .single()

  if (!simulado) return NextResponse.json({ error: 'Simulado não encontrado' }, { status: 404 })

  // Authz: dono OU admin/superadmin
  const isOwner = simulado.created_by === user.id
  if (!isOwner) {
    const { data: profile } = await service
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin'
    if (!isAdmin) {
      return NextResponse.json({ error: 'Sem permissão para exportar este simulado' }, { status: 403 })
    }
  }

  const url = req.nextUrl
  const formatRaw = (url.searchParams.get('format') ?? 'docx').toLowerCase()
  const format: 'pdf' | 'docx' | 'xlsx' =
    formatRaw === 'pdf' ? 'pdf' : formatRaw === 'xlsx' ? 'xlsx' : 'docx'

  const content: ContentFlags = {
    enunciado: flag(url.searchParams.get('enunciado'), true),
    alternativas: flag(url.searchParams.get('alternativas'), true),
    figuras: flag(url.searchParams.get('figuras'), true),
    gabarito: flag(url.searchParams.get('gabarito'), true),
    coment_alt: flag(url.searchParams.get('coment_alt'), false),
    coment_compilado: flag(url.searchParams.get('coment_compilado'), false),
    taxonomia: flag(url.searchParams.get('taxonomia'), false),
    referencias: flag(url.searchParams.get('referencias'), false),
  }

  const { data: sqRows } = await service
    .from('simulado_questions')
    .select(
      'position, note, question_id, questions!inner(id, question_number, stem, alternatives, correct_answer, exams!left(year, booklet_color, exam_boards(short_name)))'
    )
    .eq('simulado_id', id)
    .order('position', { ascending: true })

  type Row = {
    position: number
    note: string | null
    question_id: string
    questions: {
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
  }

  const rows = (sqRows ?? []) as unknown as Row[]
  const questionIds = rows.map((r) => r.question_id)

  // Imagens
  type ImageMap = Map<string, Array<{ path: string; cropped: string | null; useCropped: boolean; pageNumber: number | null; figureNumber: number | null }>>
  const imagesByQuestion: ImageMap = new Map()
  if (content.figuras && format !== 'xlsx' && questionIds.length > 0) {
    const { data: imgs } = await service
      .from('question_images')
      .select('question_id, full_page_path, cropped_path, use_cropped, page_number, figure_number')
      .in('question_id', questionIds)
    for (const img of imgs ?? []) {
      const list = imagesByQuestion.get(img.question_id as string) ?? []
      list.push({
        path: img.full_page_path as string,
        cropped: (img.cropped_path as string | null) ?? null,
        useCropped: Boolean(img.use_cropped),
        pageNumber: (img.page_number as number | null) ?? null,
        figureNumber: (img.figure_number as number | null) ?? null,
      })
      imagesByQuestion.set(img.question_id as string, list)
    }
    // Ordenar
    for (const list of imagesByQuestion.values()) {
      list.sort((a, b) => {
        const ap = a.figureNumber ?? a.pageNumber ?? 0
        const bp = b.figureNumber ?? b.pageNumber ?? 0
        return ap - bp
      })
    }
  }

  // Comentários
  type CommentRow = { question_id: string; comment_type: string; content: string; source: string | null }
  const commentsByQuestion = new Map<string, CommentRow[]>()
  const wantsComments = content.coment_alt || content.coment_compilado || content.referencias
  if (wantsComments && questionIds.length > 0) {
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
  if (content.taxonomia && questionIds.length > 0) {
    const { data: qts } = await service
      .from('question_tags')
      .select('question_id, tags!inner(label, dimension)')
      .in('question_id', questionIds)
    for (const qt of qts ?? []) {
      const tag = (qt as unknown as { question_id: string; tags: { label: string; dimension: string } })
      const list = tagsByQuestion.get(tag.question_id) ?? []
      list.push({ label: tag.tags.label, dimension: tag.tags.dimension })
      tagsByQuestion.set(tag.question_id, list)
    }
  }

  // Buscar imagens binárias (signed URL → fetch)
  const imageBytes = new Map<string, { data: Uint8Array; contentType: string }>()
  if (content.figuras && format !== 'xlsx' && imagesByQuestion.size > 0) {
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
            const ct = r.headers.get('content-type') ?? 'image/jpeg'
            imageBytes.set(s.path, { data: new Uint8Array(ab), contentType: ct })
          } catch {
            // ignore
          }
        })
      )
    }
  }

  const data: ExportData = {
    title: simulado.title as string,
    questions: rows.map((row, idx) => {
      const q = row.questions
      const exam = q.exams
      const examLabel = [exam?.exam_boards?.short_name ?? null, exam?.year ?? null]
        .filter(Boolean)
        .join(' ')
      const imgs = imagesByQuestion.get(row.question_id) ?? []
      const figures = imgs
        .map((img) => {
          const path = img.useCropped && img.cropped ? img.cropped : img.path
          const bytes = imageBytes.get(path)
          if (!bytes) return null
          return { data: bytes.data, contentType: bytes.contentType, figureNumber: img.figureNumber }
        })
        .filter((f): f is { data: Uint8Array; contentType: string; figureNumber: number | null } => f !== null)

      const cmts = commentsByQuestion.get(row.question_id) ?? []
      const comments = cmts.filter((c) => c.comment_type !== 'referencia')
      const referencias = cmts.filter((c) => c.comment_type === 'referencia')
      const tags = tagsByQuestion.get(row.question_id) ?? []
      return {
        position: idx + 1,
        questionNumber: q.question_number,
        examLabel,
        stem: q.stem ?? '',
        alternatives: (q.alternatives ?? {}) as Record<string, string>,
        correctAnswer: q.correct_answer ?? null,
        note: row.note,
        figures,
        comments,
        referencias,
        tags,
      }
    }),
    content,
  }

  const sourceFlavor = (() => {
    const parts: string[] = []
    if (simulado.filters_used && typeof simulado.filters_used === 'object') {
      const f = simulado.filters_used as Record<string, unknown>
      if (typeof f.modulo === 'string') parts.push(f.modulo)
      if (typeof f.especialidade === 'string') parts.push(f.especialidade)
    }
    return parts.length ? parts.join(' · ') : 'MedMaestro'
  })()
  data.subtitle = `${data.questions.length} questões  ·  ${sourceFlavor}`

  let buffer: Buffer | Uint8Array
  let mime: string
  let ext: string
  if (format === 'pdf') {
    buffer = await buildPdfBuffer(data)
    mime = 'application/pdf'
    ext = 'pdf'
  } else if (format === 'xlsx') {
    buffer = await buildXlsxBuffer(data)
    mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ext = 'xlsx'
  } else {
    buffer = await buildDocxBuffer(data)
    mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ext = 'docx'
  }

  const safeTitle = (simulado.title as string)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'simulado'
  const filename = `${safeTitle}.${ext}`

  const ab = buffer instanceof Uint8Array
    ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    : (buffer as Buffer).buffer.slice((buffer as Buffer).byteOffset, (buffer as Buffer).byteOffset + (buffer as Buffer).byteLength)

  // ?store=1 → upload em bucket `exports` e retorna signed URL 24h compartilhável
  if (flag(url.searchParams.get('store'), false)) {
    const path = `${simulado.id}/${Date.now()}-${filename}`
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as Buffer)
    await uploadFile('exports', path, bytes, mime)
    const signedUrl = await getExportUrl(path)

    await service
      .from('simulados')
      .update({ export_path: path, exported_at: new Date().toISOString() })
      .eq('id', simulado.id)

    return NextResponse.json({
      ok: true,
      url: signedUrl,
      path,
      filename,
      expires_in: 600,
    })
  }

  return new NextResponse(ab as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String((buffer as Uint8Array).byteLength),
    },
  })
}
