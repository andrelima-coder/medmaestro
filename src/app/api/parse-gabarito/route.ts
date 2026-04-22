import { NextResponse } from 'next/server'
import { PDFParse } from 'pdf-parse'
import { createServiceClient } from '@/lib/supabase/service'
import { parseGabarito } from '@/lib/gabarito/parser'

function checkAuth(request: Request): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: { exam_id?: string; booklet_color?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { exam_id, booklet_color } = body
  if (!exam_id || !booklet_color) {
    return NextResponse.json({ error: 'exam_id e booklet_color são obrigatórios' }, { status: 400 })
  }

  const color = booklet_color.toUpperCase()
  const supabase = createServiceClient()

  // 1. Busca exame
  const { data: exam, error: examError } = await supabase
    .from('exams')
    .select('id, gabarito_path')
    .eq('id', exam_id)
    .single()

  if (examError || !exam) {
    return NextResponse.json({ error: 'Exame não encontrado' }, { status: 404 })
  }
  if (!exam.gabarito_path) {
    return NextResponse.json({ error: 'Exame não possui gabarito_path' }, { status: 422 })
  }

  // 2. Baixa PDF do bucket
  const { data: fileData, error: dlError } = await supabase.storage
    .from('exam-pdfs')
    .download(exam.gabarito_path)

  if (dlError || !fileData) {
    return NextResponse.json(
      { error: `Falha ao baixar gabarito: ${dlError?.message}` },
      { status: 500 }
    )
  }

  const pdfBuffer = Buffer.from(await fileData.arrayBuffer())

  // 3. Extrai texto com pdf-parse
  let text: string
  try {
    const parser = new PDFParse({ data: pdfBuffer })
    const parsed = await parser.getText()
    text = parsed.text
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao extrair texto do PDF: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }

  if (!text.trim()) {
    return NextResponse.json(
      { error: 'PDF sem camada de texto — gabarito precisa de texto extraível' },
      { status: 422 }
    )
  }

  // 4. Parse do gabarito
  const result = parseGabarito(text)
  const answers = result.byColor[color] ?? {}
  const questionNumbers = Object.keys(answers).map(Number)

  if (questionNumbers.length === 0) {
    return NextResponse.json(
      { error: `Nenhuma questão encontrada para a cor ${color}` },
      { status: 422 }
    )
  }

  // 5. Upsert em answer_keys
  const rows = questionNumbers.map((qNum) => ({
    exam_id,
    question_no: qNum,
    answer: answers[qNum],
    is_altered: result.alteracoes.some((a) => a.question === qNum && a.color === color),
  }))

  const { error: upsertError } = await supabase
    .from('answer_keys')
    .upsert(rows, { onConflict: 'exam_id,question_no' })

  if (upsertError) {
    return NextResponse.json(
      { error: `Falha ao salvar gabarito: ${upsertError.message}` },
      { status: 500 }
    )
  }

  const alteracoesForColor = result.alteracoes.filter((a) => a.color === color)

  return NextResponse.json({
    ok: true,
    questions_saved: rows.length,
    alteracoes_applied: alteracoesForColor.length,
  })
}
