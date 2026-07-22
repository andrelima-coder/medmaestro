import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildFlashcardsDocx, buildFlashcardsPdf } from '@/lib/exports/flashcards'
import { examLabel } from '@/lib/exams/label'
import { isHtml, htmlToPlainText } from '@/lib/utils/sanitize-html'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Format = 'tsv' | 'csv' | 'json' | 'docx' | 'pdf'

type FlashcardRow = {
  id: string
  front: string
  back: string
  card_type: string | null
  difficulty: number | null
  approved: boolean | null
  created_at: string | null
  source_question_id: string | null
  questions: {
    question_number: number | null
    exams: {
      year: number | null
      booklet_color: string | null
      specialties: { name: string | null } | null
    } | null
  } | null
  flashcard_tags: Array<{ tags: { label: string | null; dimension: string | null } | null }> | null
}

function semanticTags(row: FlashcardRow): string[] {
  return (row.flashcard_tags ?? [])
    .map((ft) => ft.tags?.label ?? null)
    .filter((l): l is string => !!l)
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function escapeTsv(value: string): string {
  return value.replace(/\t/g, ' ').replace(/\r?\n/g, '<br>')
}

function buildExamLabel(row: FlashcardRow): string {
  const exam = row.questions?.exams
  if (!exam) return ''
  return examLabel({
    name: exam.specialties?.name,
    year: exam.year,
    bookletColor: exam.booklet_color,
  })
}

function buildTagsField(row: FlashcardRow): string {
  const tags: string[] = ['MedMaestro']
  const examLabel = buildExamLabel(row)
  if (examLabel) tags.push(examLabel.replace(/\s+/g, '_'))
  if (row.card_type) tags.push(row.card_type)
  if (row.questions?.question_number != null) {
    tags.push(`Q${row.questions.question_number}`)
  }
  for (const t of semanticTags(row)) tags.push(t.replace(/\s+/g, '_'))
  return tags.join(' ')
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const url = req.nextUrl
  const formatRaw = (url.searchParams.get('format') ?? 'tsv').toLowerCase()
  const format: Format = (['csv', 'json', 'docx', 'pdf'] as const).includes(
    formatRaw as 'csv' | 'json' | 'docx' | 'pdf'
  )
    ? (formatRaw as Format)
    : 'tsv'

  const examId = url.searchParams.get('exam_id') ?? undefined
  const approvedOnly = url.searchParams.get('approved_only') !== '0'
  const ids = url.searchParams.get('ids')?.split(',').filter(Boolean)

  const service = createServiceClient()

  // Exportar cards aprovados é livre (estudo via Anki). Incluir NÃO aprovados
  // (approved_only=0) exige papel de revisor — não vaza rascunhos pendentes.
  if (!approvedOnly) {
    const { data: profile } = await service
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    const REVIEWER_ROLES = new Set(['professor', 'admin', 'superadmin'])
    if (!profile || !REVIEWER_ROLES.has(profile.role as string)) {
      return NextResponse.json(
        { error: 'Apenas revisores podem exportar flashcards não aprovados' },
        { status: 403 }
      )
    }
  }
  let query = service
    .from('flashcards')
    .select(
      'id, front, back, card_type, difficulty, approved, created_at, source_question_id, questions(question_number, exams(year, booklet_color, specialties(name))), flashcard_tags(tags(label, dimension))'
    )
    .order('created_at', { ascending: false })
    .limit(5000)

  if (approvedOnly) query = query.eq('approved', true)
  if (ids && ids.length > 0) query = query.in('id', ids)

  // Filtro de exame aplicado NA QUERY (antes era em memória, depois do
  // limit(5000) — cards do exame podiam sumir do export sem aviso).
  if (examId) {
    const { data: qs } = await service
      .from('questions')
      .select('id')
      .eq('exam_id', examId)
    const allowedIds = (qs ?? []).map((q) => q.id as string)
    if (allowedIds.length === 0) {
      query = query.eq('source_question_id', '00000000-0000-0000-0000-000000000000')
    } else {
      query = query.in('source_question_id', allowedIds)
    }
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as FlashcardRow[]

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `medmaestro-flashcards-${stamp}.${format}`

  if (format === 'docx' || format === 'pdf') {
    // DOCX/PDF não renderizam HTML — cards com formatação rica saíam com
    // "<p>...</p>" literal no documento. Converte para texto puro.
    const asPlain = (s: string | null | undefined): string =>
      isHtml(s) ? htmlToPlainText(s) : (s ?? '')
    const cards = rows.map((r) => ({
      front: asPlain(r.front),
      back: asPlain(r.back),
      cardType: r.card_type,
      difficulty: r.difficulty,
      examLabel: buildExamLabel(r),
      questionNumber: r.questions?.question_number ?? null,
      tags: semanticTags(r),
    }))
    const exportData = {
      title: 'Flashcards — MedMaestro',
      subtitle: `${cards.length} flashcards · ${stamp}`,
      cards,
    }

    const bytes =
      format === 'docx' ? await buildFlashcardsDocx(exportData) : await buildFlashcardsPdf(exportData)
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer
    return new NextResponse(ab, {
      status: 200,
      headers: {
        'Content-Type':
          format === 'docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(bytes.byteLength),
      },
    })
  }

  if (format === 'json') {
    const payload = rows.map((r) => ({
      id: r.id,
      front: r.front,
      back: r.back,
      card_type: r.card_type,
      difficulty: r.difficulty,
      approved: r.approved,
      created_at: r.created_at,
      source_question_id: r.source_question_id,
      exam: buildExamLabel(r) || null,
      question_number: r.questions?.question_number ?? null,
      tags: buildTagsField(r).split(' '),
    }))
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  if (format === 'tsv') {
    const lines: string[] = ['#separator:tab', '#html:true', '#tags column:3']
    for (const r of rows) {
      lines.push(
        [escapeTsv(r.front ?? ''), escapeTsv(r.back ?? ''), buildTagsField(r)].join('\t')
      )
    }
    return new NextResponse(lines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/tab-separated-values; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  const header = ['front', 'back', 'tags', 'card_type', 'difficulty', 'exam', 'question_number']
  const csvLines = [header.join(',')]
  for (const r of rows) {
    csvLines.push(
      [
        escapeCsv(r.front ?? ''),
        escapeCsv(r.back ?? ''),
        escapeCsv(buildTagsField(r)),
        escapeCsv(r.card_type ?? ''),
        escapeCsv(String(r.difficulty ?? '')),
        escapeCsv(buildExamLabel(r)),
        escapeCsv(String(r.questions?.question_number ?? '')),
      ].join(',')
    )
  }
  return new NextResponse(csvLines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
