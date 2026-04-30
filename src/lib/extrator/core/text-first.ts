import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, unlink } from 'fs/promises'
import type { BancaParser } from './types'

const execFileAsync = promisify(execFile)
const PDFTOTEXT = process.env.PDFTOTEXT_PATH ?? 'pdftotext'

// Detecta menções a recursos visuais. Sem `\b` no fim para casar plural/derivados
// (ex.: "imagens", "ultrassonográfico", "figuras", "radiografias").
// IMPORTANTE: falsos negativos aqui = imagens perdidas para sempre. Prefira amplo a estrito.
const MEDICAL_IMAGE_PATTERNS =
  /\b(ecg|eletrocardiogram|radiograf|raio[\s-]?x|\brx\b|tomograf|\btc\b|ress?on[âa]nci|\brm\b|capnograf|gr[áa]fic|curva\s+(?:p-?v|de\s+(?:fluxo|press[ãa]o|volume))|guyton|rotem|tromboelastogram|eeg|ultrassom|ultrassonogr|ultrassonográfic|\bus\b|ecocardiogr|cintilograf|esquema|tabel|figura|imagem|imagens|ilustrad|abaixo|a\s+seguir|exame\s+de\s+imagem|achados?\s+(?:radiol[óo]gicos?|tomogr[áa]ficos?|ecogr[áa]ficos?|de\s+imagem))/i

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
  rawText: string
}

export async function runPdftotext(pdfBuffer: Buffer, layout: boolean): Promise<string> {
  const id = crypto.randomUUID()
  const pdfPath = `/tmp/mm-tf-${id}.pdf`
  const txtPath = `/tmp/mm-tf-${id}.txt`
  await writeFile(pdfPath, pdfBuffer)
  try {
    const args = [...(layout ? ['-layout'] : []), '-enc', 'UTF-8', pdfPath, txtPath]
    await execFileAsync(PDFTOTEXT, args)
    return await readFile(txtPath, 'utf8')
  } finally {
    await Promise.all([unlink(pdfPath).catch(() => {}), unlink(txtPath).catch(() => {})])
  }
}

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

function parseAlternatives(block: string, regexAlt: RegExp): Record<string, string> {
  const alts: Record<string, string> = {}
  // Trabalhamos com cópia stateful da regex global da banca.
  const re = new RegExp(regexAlt.source, regexAlt.flags.includes('g') ? regexAlt.flags : regexAlt.flags + 'g')
  const matches: Array<{ letter: string; start: number; end: number }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    matches.push({ letter: m[2].toUpperCase(), start: m.index + m[0].indexOf(m[2]), end: re.lastIndex })
  }
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]
    const next = matches[i + 1]
    const slice = block.slice(cur.end, next ? next.start : block.length)
    const content = slice.replace(/\s+/g, ' ').replace(/^\s*[.):\-]\s*/, '').trim()
    if (content && content.length > 0 && content.length < 1500) {
      alts[cur.letter] = content
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
  pdfBuffer: Buffer,
  banca: BancaParser
): Promise<TextExtractionResult> {
  let text: string
  try {
    text = await runPdftotext(pdfBuffer, true)
  } catch {
    return {
      questions: [],
      hasNativeText: false,
      totalPages: 0,
      pageBreaks: [],
      rawText: '',
    }
  }

  const trimmed = text.trim()
  if (trimmed.length < 200) {
    return {
      questions: [],
      hasNativeText: false,
      totalPages: 0,
      pageBreaks: [],
      rawText: text,
    }
  }

  const { offsets } = buildPageHintIndex(text)
  const regexQ = banca.regexQuestao()
  const regexA = banca.regexAlternativa()

  const matches: { num: number; start: number }[] = []
  let m: RegExpExecArray | null
  // Reset lastIndex caso a regex venha "suja".
  regexQ.lastIndex = 0
  while ((m = regexQ.exec(text)) !== null) {
    const numStr = m[1] ?? m[2]
    if (!numStr) continue
    matches.push({ num: parseInt(numStr, 10), start: m.index })
  }

  if (matches.length < 5) {
    return {
      questions: [],
      hasNativeText: trimmed.length > 200,
      totalPages: offsets.length,
      pageBreaks: offsets,
      rawText: text,
    }
  }

  const questions: TextExtractedQuestion[] = []
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start
    const end = i + 1 < matches.length ? matches[i + 1].start : text.length
    const block = text.slice(start, end)

    const body = block.replace(/^[\s\S]*?(?:QUEST[ÃA]O|Q\.?)\s*\d+\s*[.):\-]?\s*/i, '')

    const firstAltMatch = body.match(/\n\s*A[\s.\)\-:]/)
    const stemRaw = firstAltMatch
      ? body.slice(0, firstAltMatch.index ?? body.length)
      : body
    const altsBlock = firstAltMatch
      ? body.slice(firstAltMatch.index ?? body.length)
      : ''

    const stem = stemRaw.replace(/\s+/g, ' ').trim()
    const alternatives = altsBlock ? parseAlternatives(altsBlock, regexA) : {}

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
    rawText: text,
  }
}
