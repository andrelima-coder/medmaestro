import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Format = 'tsv' | 'csv' | 'json'

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
  const spec = exam.specialties?.name ?? ''
  const color = exam.booklet_color ? ` ${exam.booklet_color}` : ''
  return `${spec} ${exam.year ?? ''}${color}`.trim()
}

function buildTagsField(row: FlashcardRow): string {
  const tags: string[] = ['MedMaestro']
  const examLabel = buildExamLabel(row)
  if (examLabel) tags.push(examLabel.replace(/\s+/g, '_'))
  if (row.card_type) tags.push(row.card_type)
  if (row.questions?.question_number != null) {
    tags.push(`Q${row.questions.question_number}`)
  }
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
  const format: Format =
    formatRaw === 'csv' ? 'csv' : formatRaw === 'json' ? 'json' : 'tsv'

  const examId = url.searchParams.get('exam_id') ?? undefined
  const approvedOnly = url.searchParams.get('approved_only') !== '0'
  const ids = url.searchParams.get('ids')?.split(',').filter(Boolean)

  const service = createServiceClient()
  let query = service
    .from('flashcards')
    .select(
      'id, front, back, card_type, difficulty, approved, created_at, source_question_id, questions(question_number, exams(year, booklet_color, specialties(name)))'
    )
    .order('created_at', { ascending: false })
    .limit(5000)

  if (approvedOnly) query = query.eq('approved', true)
  if (ids && ids.length > 0) query = query.in('id', ids)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let rows = (data ?? []) as unknown as FlashcardRow[]

  if (examId) {
    const service2 = createServiceClient()
    const { data: qs } = await service2
      .from('questions')
      .select('id')
      .eq('exam_id', examId)
    const allowed = new Set((qs ?? []).map((q) => q.id as string))
    rows = rows.filter((r) =>
      r.source_question_id ? allowed.has(r.source_question_id) : false
    )
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `medmaestro-flashcards-${stamp}.${format}`

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
    const lines: string[] = ['#separator:tab', '#html:false', '#tags column:3']
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
