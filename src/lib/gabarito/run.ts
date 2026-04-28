import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, unlink } from 'fs/promises'
import { createServiceClient } from '@/lib/supabase/service'
import { parseGabarito } from '@/lib/gabarito/parser'

const execFileAsync = promisify(execFile)
const PDFTOTEXT = process.env.PDFTOTEXT_PATH ?? 'pdftotext'

async function extractTextWithPdftotext(pdfBuffer: Buffer): Promise<string> {
  const id = crypto.randomUUID()
  const pdfPath = `/tmp/mm-gab-${id}.pdf`
  const txtPath = `/tmp/mm-gab-${id}.txt`

  await writeFile(pdfPath, pdfBuffer)

  try {
    await execFileAsync(PDFTOTEXT, ['-layout', '-enc', 'UTF-8', pdfPath, txtPath])
    return await readFile(txtPath, 'utf8')
  } finally {
    await Promise.all([
      unlink(pdfPath).catch(() => {}),
      unlink(txtPath).catch(() => {}),
    ])
  }
}

export type ParseGabaritoResult =
  | {
      ok: true
      questions_saved: number
      correct_answers_synced: number
      alteracoes_applied: number
    }
  | { ok: false; status: number; error: string }

export async function parseGabaritoForExam(
  examId: string,
  bookletColor: string
): Promise<ParseGabaritoResult> {
  const color = bookletColor.toUpperCase()
  const supabase = createServiceClient()

  const { data: exam, error: examError } = await supabase
    .from('exams')
    .select('id, answer_key_pdf_path')
    .eq('id', examId)
    .single()

  if (examError || !exam) {
    return { ok: false, status: 404, error: 'Exame não encontrado' }
  }
  if (!exam.answer_key_pdf_path) {
    return { ok: false, status: 422, error: 'Exame não possui gabarito em PDF' }
  }

  const { data: fileData, error: dlError } = await supabase.storage
    .from('exam-pdfs')
    .download(exam.answer_key_pdf_path as string)

  if (dlError || !fileData) {
    return { ok: false, status: 500, error: `Falha ao baixar gabarito: ${dlError?.message}` }
  }

  const pdfBuffer = Buffer.from(await fileData.arrayBuffer())

  let text: string
  try {
    text = await extractTextWithPdftotext(pdfBuffer)
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: `Falha ao extrair texto do PDF: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (!text.trim()) {
    return {
      ok: false,
      status: 422,
      error: 'PDF sem camada de texto — gabarito precisa de texto extraível',
    }
  }

  const result = parseGabarito(text)
  const answers = result.byColor[color] ?? {}
  const questionNumbers = Object.keys(answers).map(Number)

  if (questionNumbers.length === 0) {
    return { ok: false, status: 422, error: `Nenhuma questão encontrada para a cor ${color}` }
  }

  const rows = questionNumbers.map((qNum) => ({
    exam_id: examId,
    question_number: qNum,
    correct_answer: answers[qNum],
    notes: result.alteracoes.some((a) => a.question === qNum && a.color === color)
      ? 'alterada'
      : null,
  }))

  const { error: upsertError } = await supabase
    .from('answer_keys')
    .upsert(rows, { onConflict: 'exam_id,question_number' })

  if (upsertError) {
    return { ok: false, status: 500, error: `Falha ao salvar gabarito: ${upsertError.message}` }
  }

  let synced = 0
  try {
    const { data: syncCount } = await supabase.rpc('sync_correct_answers', {
      p_exam_id: examId,
    })
    synced = (syncCount as number | null) ?? 0
  } catch {
    // Não bloqueia — pode ser que as questões ainda não existam
  }

  const alteracoesForColor = result.alteracoes.filter((a) => a.color === color)

  return {
    ok: true,
    questions_saved: rows.length,
    correct_answers_synced: synced,
    alteracoes_applied: alteracoesForColor.length,
  }
}
