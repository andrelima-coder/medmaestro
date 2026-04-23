import { NextRequest, NextResponse } from 'next/server'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  PageBreak,
} from 'docx'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const service = createServiceClient()

  const { data: simulado } = await service
    .from('simulados')
    .select('id, title, created_by')
    .eq('id', id)
    .single()

  if (!simulado) return NextResponse.json({ error: 'Simulado não encontrado' }, { status: 404 })

  const { data: sqRows } = await service
    .from('simulado_questions')
    .select(
      'position, note, questions!inner(question_number, stem, alternatives, correct_answer, exams!left(year, booklet_color, exam_boards(short_name)))'
    )
    .eq('simulado_id', id)
    .order('position', { ascending: true })

  const questions = (sqRows ?? []).map((row) => {
    const q = row.questions as unknown as {
      question_number: number
      stem: string
      alternatives: Record<string, string> | null
      correct_answer: string | null
      exams: { year: number; booklet_color: string | null; exam_boards: { short_name: string } | null } | null
    }
    const exam = q.exams
    const examLabel = [exam?.exam_boards?.short_name, exam?.year].filter(Boolean).join(' ')
    return {
      position: row.position as number,
      note: row.note as string | null,
      questionNumber: q.question_number,
      stem: q.stem,
      alternatives: q.alternatives ?? {},
      correctAnswer: q.correct_answer,
      examLabel,
    }
  })

  const LETTERS = ['A', 'B', 'C', 'D', 'E']

  const questionSections: Paragraph[] = []

  questions.forEach((q, idx) => {
    // Cabeçalho da questão
    questionSections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Questão ${idx + 1}`,
            bold: true,
            size: 24,
            color: '1a1a2e',
          }),
          ...(q.examLabel
            ? [
                new TextRun({
                  text: `  ·  Q${q.questionNumber}  ·  ${q.examLabel}`,
                  size: 20,
                  color: '666666',
                }),
              ]
            : []),
        ],
        spacing: { before: idx === 0 ? 0 : 400, after: 160 },
      })
    )

    // Enunciado
    questionSections.push(
      new Paragraph({
        children: [new TextRun({ text: q.stem, size: 22 })],
        spacing: { after: 200 },
      })
    )

    // Alternativas
    LETTERS.forEach((letter) => {
      const text = q.alternatives[letter]
      if (!text) return
      questionSections.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${letter})  `, bold: true, size: 22 }),
            new TextRun({ text, size: 22 }),
          ],
          indent: { left: 360 },
          spacing: { after: 80 },
        })
      )
    })

    // Linha de resposta
    questionSections.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Resposta: ______', size: 22, color: '999999' }),
        ],
        spacing: { before: 160, after: 80 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
        },
      })
    )

    // Nota do professor (se houver)
    if (q.note) {
      questionSections.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Nota: ', bold: true, size: 20, color: '555555' }),
            new TextRun({ text: q.note, size: 20, color: '555555', italics: true }),
          ],
          spacing: { before: 80, after: 80 },
        })
      )
    }
  })

  // Gabarito (tabela no final)
  const COLS = 5
  const rows: TableRow[] = []
  const chunks: typeof questions[] = []
  for (let i = 0; i < questions.length; i += COLS) {
    chunks.push(questions.slice(i, i + COLS))
  }
  chunks.forEach((chunk) => {
    const headerCells = chunk.map((q, i) =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: `Q${chunk[0].position ? '' : ''}${questions.indexOf(q) + 1}`, bold: true, size: 18 })], alignment: AlignmentType.CENTER })],
        width: { size: 20, type: WidthType.PERCENTAGE },
      })
    )
    const answerCells = chunk.map((q) =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: q.correctAnswer ?? '—', bold: true, size: 18, color: q.correctAnswer ? '1a7a3f' : '999999' })], alignment: AlignmentType.CENTER })],
        width: { size: 20, type: WidthType.PERCENTAGE },
      })
    )
    // Preencher colunas vazias
    while (headerCells.length < COLS) {
      headerCells.push(new TableCell({ children: [new Paragraph({ children: [] })], width: { size: 20, type: WidthType.PERCENTAGE } }))
      answerCells.push(new TableCell({ children: [new Paragraph({ children: [] })], width: { size: 20, type: WidthType.PERCENTAGE } }))
    }
    rows.push(new TableRow({ children: headerCells }))
    rows.push(new TableRow({ children: answerCells }))
  })

  const doc = new Document({
    sections: [
      {
        children: [
          // Título
          new Paragraph({
            children: [new TextRun({ text: simulado.title as string, bold: true, size: 32 })],
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `${questions.length} questões  ·  MedMaestro`,
                size: 20,
                color: '888888',
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
          }),

          // Questões
          ...questionSections,

          // Gabarito
          new Paragraph({
            children: [new PageBreak()],
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Gabarito', bold: true, size: 28 })],
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 300 },
          }),
          ...(rows.length > 0
            ? [
                new Table({
                  rows,
                  width: { size: 100, type: WidthType.PERCENTAGE },
                }),
              ]
            : [new Paragraph({ children: [new TextRun({ text: 'Sem gabarito disponível.', size: 22 })] })]),
        ],
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  const filename = `simulado-${id}.docx`

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.byteLength.toString(),
    },
  })
}
