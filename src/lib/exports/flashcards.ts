import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export type FlashcardExport = {
  front: string
  back: string
  cardType: string | null
  difficulty: number | null
  examLabel: string
  questionNumber: number | null
  tags: string[]
}

export type FlashcardsExportData = {
  title: string
  subtitle?: string
  cards: FlashcardExport[]
}

const CARD_TYPE_LABEL: Record<string, string> = {
  qa: 'Q&A',
  cloze: 'Cloze',
  image_occlusion: 'Imagem',
}

function cardTypeLabel(t: string | null): string {
  return t ? CARD_TYPE_LABEL[t] ?? t : '—'
}

// ============================================================
// DOCX
// ============================================================
export async function buildFlashcardsDocx(data: FlashcardsExportData): Promise<Buffer> {
  const children: Paragraph[] = []

  children.push(
    new Paragraph({
      children: [new TextRun({ text: data.title, bold: true, size: 32 })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: data.subtitle ?? `${data.cards.length} flashcards`,
          size: 20,
          color: '888888',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  )

  data.cards.forEach((c, i) => {
    const meta = [
      cardTypeLabel(c.cardType),
      `Dificuldade ${c.difficulty ?? '—'}`,
      c.questionNumber != null ? `Q${c.questionNumber}` : null,
      c.examLabel || null,
    ]
      .filter(Boolean)
      .join('  ·  ')

    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${i + 1}. ${meta}`, bold: true, size: 18, color: '666666' })],
        spacing: { before: 200, after: 40 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Frente: ', bold: true, size: 22 }),
          new TextRun({ text: c.front, size: 22 }),
        ],
        spacing: { after: 40 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Verso: ', bold: true, size: 22 }),
          new TextRun({ text: c.back, size: 22 }),
        ],
        spacing: { after: c.tags.length ? 40 : 120 },
      })
    )
    if (c.tags.length) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Tags: ${c.tags.join(' · ')}`, italics: true, size: 16, color: '888888' })],
          spacing: { after: 120 },
        })
      )
    }
  })

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}

// ============================================================
// PDF
// ============================================================
export async function buildFlashcardsPdf(data: FlashcardsExportData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique)

  const PAGE_W = 595
  const PAGE_H = 842
  const MARGIN = 56
  const CONTENT_W = PAGE_W - MARGIN * 2

  let page = pdf.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
  }

  function wrap(text: string, maxWidth: number, f: typeof font, size: number): string[] {
    if (!text) return ['']
    const words = text.split(/\s+/)
    const lines: string[] = []
    let line = ''
    for (const w of words) {
      const tentative = line ? `${line} ${w}` : w
      if (f.widthOfTextAtSize(tentative, size) > maxWidth) {
        if (line) lines.push(line)
        if (f.widthOfTextAtSize(w, size) > maxWidth) {
          let chunk = ''
          for (const ch of w) {
            if (f.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              if (chunk) lines.push(chunk)
              chunk = ch
            } else {
              chunk += ch
            }
          }
          line = chunk
        } else {
          line = w
        }
      } else {
        line = tentative
      }
    }
    if (line) lines.push(line)
    return lines.length ? lines : ['']
  }

  function drawText(
    text: string,
    opts: {
      size?: number
      bold?: boolean
      italic?: boolean
      color?: [number, number, number]
      indent?: number
      after?: number
    } = {}
  ) {
    const size = opts.size ?? 10
    const f = opts.bold ? fontBold : opts.italic ? fontItalic : font
    const color = opts.color ?? [0.1, 0.1, 0.15]
    const x = MARGIN + (opts.indent ?? 0)
    const maxW = CONTENT_W - (opts.indent ?? 0)
    const lh = size * 1.35
    for (const line of wrap(text, maxW, f, size)) {
      ensureSpace(lh)
      page.drawText(line, { x, y: y - size, size, font: f, color: rgb(color[0], color[1], color[2]) })
      y -= lh
    }
    y -= opts.after ?? 0
  }

  function drawDivider(color: [number, number, number] = [0.85, 0.85, 0.88]) {
    ensureSpace(8)
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: rgb(color[0], color[1], color[2]),
    })
    y -= 8
  }

  drawText(data.title, { size: 18, bold: true, after: 4 })
  drawText(data.subtitle ?? `${data.cards.length} flashcards`, {
    size: 10,
    color: [0.45, 0.45, 0.5],
    after: 8,
  })
  drawDivider([0.85, 0.7, 0.3])
  y -= 12

  data.cards.forEach((c, i) => {
    const meta = [
      cardTypeLabel(c.cardType),
      `Dif. ${c.difficulty ?? '—'}`,
      c.questionNumber != null ? `Q${c.questionNumber}` : null,
      c.examLabel || null,
    ]
      .filter(Boolean)
      .join('  ·  ')

    ensureSpace(40)
    drawText(`${i + 1}.  ${meta}`, { size: 9, bold: true, color: [0.4, 0.4, 0.45], after: 3 })
    drawText(`Frente: ${c.front}`, { size: 11, after: 3 })
    drawText(`Verso: ${c.back}`, { size: 11, color: [0.2, 0.2, 0.25], after: c.tags.length ? 3 : 10 })
    if (c.tags.length) {
      drawText(c.tags.join('  ·  '), { size: 8, italic: true, color: [0.5, 0.5, 0.55], after: 10 })
    }
  })

  return pdf.save()
}
