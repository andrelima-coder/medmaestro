import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, unlink } from 'fs/promises'

const execFileAsync = promisify(execFile)
const PDFTOTEXT = process.env.PDFTOTEXT_PATH ?? 'pdftotext'

// Detecta menções a recursos visuais. Sem `\b` no fim para casar plural/derivados
// (ex.: "imagens", "ultrassonográfico", "figuras", "radiografias").
// IMPORTANTE: falsos negativos aqui = imagens perdidas para sempre. Prefira amplo a estrito.
const MEDICAL_IMAGE_PATTERNS =
  /\b(ecg|eletrocardiogram|radiograf|raio[\s-]?x|\brx\b|tomograf|\btc\b|ress?on[âa]nci|\brm\b|capnograf|gr[áa]fic|curva\s+(?:p-?v|de\s+(?:fluxo|press[ãa]o|volume))|guyton|rotem|tromboelastogram|eeg|ultrassom|ultrassonogr|ultrassonográfic|\bus\b|ecocardiogr|cintilograf|esquema|tabel|figura|imagem|imagens|ilustrad|abaixo|a\s+seguir|exame\s+de\s+imagem|achados?\s+(?:radiol[óo]gicos?|tomogr[áa]ficos?|ecogr[áa]ficos?|de\s+imagem))/i

// Gatilhos fortes que, mesmo isolados, indicam que a questão depende de figura/tabela.
// Usados como defesa em profundidade contra falsos negativos da regex acima.
const STRONG_VISUAL_HINTS =
  /(imagens?\s+a\s+seguir|figuras?\s+a\s+seguir|figura\s+abaixo|imagem\s+abaixo|tabela\s+abaixo|ilustrad[ao]s?\s+(?:abaixo|a\s+seguir|nas?\s+(?:imagens?|figuras?))|conforme\s+(?:imagem|figura|tabela)|observe\s+(?:a|as)\s+(?:imagem|imagens|figura|figuras)|achados?\s+(?:mais\s+relevantes?\s+)?(?:est[ãa]o\s+)?ilustrad)/i

export type TextExtractedQuestion = {
  question_number: number
  stem: string
  alternatives: Record<string, string>
  has_medical_image_hint: boolean
  page_hint: number | null
  confidence: number
}

export type TextExtractionResult = {
  questions: TextExtractedQuestion[]
  hasNativeText: boolean
  totalPages: number
  pageBreaks: number[]
}

async function runPdftotext(pdfBuffer: Buffer, layout: boolean): Promise<string> {
  const id = crypto.randomUUID()
  const pdfPath = `/tmp/mm-tf-${id}.pdf`
  const txtPath = `/tmp/mm-tf-${id}.txt`
  await writeFile(pdfPath, pdfBuffer)
  try {
    const args = [
      ...(layout ? ['-layout'] : []),
      '-enc',
      'UTF-8',
      pdfPath,
      txtPath,
    ]
    await execFileAsync(PDFTOTEXT, args)
    return await readFile(txtPath, 'utf8')
  } finally {
    await Promise.all([
      unlink(pdfPath).catch(() => {}),
      unlink(txtPath).catch(() => {}),
    ])
  }
}

// pdftotext insere \f (form feed) entre páginas. Usamos isso para mapear posição → página.
function buildPageHintIndex(text: string): { offsets: number[] } {
  const offsets: number[] = [0]
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0x0c) offsets.push(i + 1)
  }
  return { offsets }
}

function pageFromOffset(offset: number, offsets: number[]): number | null {
  if (offsets.length === 0) return null
  for (let i = offsets.length - 1; i >= 0; i--) {
    if (offset >= offsets[i]) return i + 1
  }
  return 1
}

const QUESTION_REGEX = /(?:^|\n)\s*QUEST[ÃA]O\s+(\d{1,3})\s*\b/gi

const ALT_REGEX_GLOBAL = /(^|\n)\s*([A-E])[\s.\)\-]+([\s\S]*?)(?=(?:\n\s*[A-E][\s.\)\-])|$)/g

function parseAlternatives(block: string): Record<string, string> {
  const alts: Record<string, string> = {}
  ALT_REGEX_GLOBAL.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ALT_REGEX_GLOBAL.exec(block)) !== null) {
    const letter = m[2].toUpperCase()
    const content = m[3]
      .replace(/\s+/g, ' ')
      .replace(/^\s*[.):\-]\s*/, '')
      .trim()
    if (content && content.length > 0 && content.length < 1500) {
      alts[letter] = content
    }
  }
  return alts
}

function scoreQuestion(stem: string, alts: Record<string, string>): number {
  let s = 0
  if (stem.length >= 30) s += 0.4
  if (stem.length >= 80) s += 0.1
  const altCount = Object.keys(alts).length
  if (altCount >= 4) s += 0.3
  if (altCount === 5) s += 0.2
  return Math.min(1, s)
}

export async function extractTextFirst(
  pdfBuffer: Buffer
): Promise<TextExtractionResult> {
  let text: string
  try {
    text = await runPdftotext(pdfBuffer, true)
  } catch {
    return { questions: [], hasNativeText: false, totalPages: 0, pageBreaks: [] }
  }

  const trimmed = text.trim()
  if (trimmed.length < 200) {
    return {
      questions: [],
      hasNativeText: false,
      totalPages: 0,
      pageBreaks: [],
    }
  }

  const { offsets } = buildPageHintIndex(text)

  // Encontra todas as posições de "QUESTÃO N"
  const matches: { num: number; start: number }[] = []
  let m: RegExpExecArray | null
  QUESTION_REGEX.lastIndex = 0
  while ((m = QUESTION_REGEX.exec(text)) !== null) {
    matches.push({ num: parseInt(m[1], 10), start: m.index })
  }

  if (matches.length < 5) {
    return {
      questions: [],
      hasNativeText: trimmed.length > 200,
      totalPages: offsets.length,
      pageBreaks: offsets,
    }
  }

  const questions: TextExtractedQuestion[] = []
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start
    const end = i + 1 < matches.length ? matches[i + 1].start : text.length
    const block = text.slice(start, end)

    // Remove "QUESTÃO N" do começo
    const body = block.replace(/^[\s\S]*?QUEST[ÃA]O\s+\d+\s*/i, '')

    // Encontra primeira alternativa para separar stem/alts
    const firstAltMatch = body.match(/\n\s*A[\s.\)\-]/)
    const stemRaw = firstAltMatch
      ? body.slice(0, firstAltMatch.index ?? body.length)
      : body
    const altsBlock = firstAltMatch
      ? body.slice(firstAltMatch.index ?? body.length)
      : ''

    const stem = stemRaw.replace(/\s+/g, ' ').trim()
    const alternatives = altsBlock ? parseAlternatives(altsBlock) : {}

    const confidence = scoreQuestion(stem, alternatives)
    const fullText = `${stem} ${Object.values(alternatives).join(' ')}`
    const has_medical_image_hint =
      MEDICAL_IMAGE_PATTERNS.test(fullText) || STRONG_VISUAL_HINTS.test(fullText)
    const page_hint = pageFromOffset(start, offsets)

    questions.push({
      question_number: matches[i].num,
      stem,
      alternatives,
      has_medical_image_hint,
      page_hint,
      confidence,
    })
  }

  return {
    questions,
    hasNativeText: true,
    totalPages: offsets.length,
    pageBreaks: offsets,
  }
}
