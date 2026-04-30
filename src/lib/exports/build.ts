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
  ImageRun,
} from 'docx'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import ExcelJS from 'exceljs'

export type ContentFlags = {
  enunciado: boolean
  alternativas: boolean
  figuras: boolean
  gabarito: boolean
  coment_alt: boolean
  coment_compilado: boolean
  taxonomia: boolean
  referencias: boolean
}

export type CommentRow = {
  question_id: string
  comment_type: string
  content: string
  source: string | null
}

export type QuestionData = {
  position: number
  questionNumber: number
  examLabel: string
  stem: string
  alternatives: Record<string, string>
  correctAnswer: string | null
  note: string | null
  figures: Array<{ data: Uint8Array; contentType: string; figureNumber: number | null }>
  comments: CommentRow[]
  referencias: CommentRow[]
  tags: Array<{ label: string; dimension: string }>
}

export type ExportData = {
  title: string
  subtitle?: string
  questions: QuestionData[]
  content: ContentFlags
}

const LETTERS = ['A', 'B', 'C', 'D', 'E']
const COMMENT_TYPE_LABEL: Record<string, string> = {
  explicacao: 'Explicação',
  pegadinha: 'Pegadinha',
  mnemonico: 'Mnemônico',
  atualizacao_conduta: 'Atualização de conduta',
  referencia: 'Referência',
}

// ============================================================
// DOCX
// ============================================================
export async function buildDocxBuffer(data: ExportData): Promise<Buffer> {
  const sectionChildren: (Paragraph | Table)[] = []

  sectionChildren.push(
    new Paragraph({
      children: [new TextRun({ text: data.title, bold: true, size: 32 })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: data.subtitle ?? `${data.questions.length} questões`,
          size: 20,
          color: '888888',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  )

  data.questions.forEach((q, idx) => {
    sectionChildren.push(
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
            : [
                new TextRun({
                  text: `  ·  Q${q.questionNumber}`,
                  size: 20,
                  color: '666666',
                }),
              ]),
        ],
        spacing: { before: idx === 0 ? 0 : 400, after: 160 },
      })
    )

    if (data.content.taxonomia && q.tags.length > 0) {
      const tagText = q.tags.map((t) => `${t.dimension}: ${t.label}`).join('  ·  ')
      sectionChildren.push(
        new Paragraph({
          children: [new TextRun({ text: tagText, size: 18, color: '888888', italics: true })],
          spacing: { after: 120 },
        })
      )
    }

    if (data.content.enunciado) {
      sectionChildren.push(
        new Paragraph({
          children: [new TextRun({ text: q.stem, size: 22 })],
          spacing: { after: 200 },
        })
      )
    }

    if (data.content.figuras && q.figures.length > 0) {
      for (const fig of q.figures) {
        try {
          const type: 'jpg' | 'png' | 'gif' | 'bmp' =
            fig.contentType.includes('png')
              ? 'png'
              : fig.contentType.includes('gif')
                ? 'gif'
                : fig.contentType.includes('bmp')
                  ? 'bmp'
                  : 'jpg'
          sectionChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: fig.data,
                  transformation: { width: 420, height: 300 },
                  type,
                }),
              ],
              spacing: { after: 160 },
            })
          )
        } catch {
          // ignora figura corrompida
        }
      }
    }

    if (data.content.alternativas) {
      LETTERS.forEach((letter) => {
        const text = q.alternatives[letter]
        if (!text) return
        const isCorrect = data.content.gabarito && q.correctAnswer === letter
        sectionChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${letter})  `,
                bold: true,
                size: 22,
                color: isCorrect ? '1a7a3f' : undefined,
              }),
              new TextRun({
                text,
                size: 22,
                color: isCorrect ? '1a7a3f' : undefined,
              }),
            ],
            indent: { left: 360 },
            spacing: { after: 80 },
          })
        )
      })
    }

    if (data.content.gabarito) {
      const correctText = q.correctAnswer
        ? `Gabarito: ${q.correctAnswer}${q.alternatives[q.correctAnswer] ? ` — ${q.alternatives[q.correctAnswer]}` : ''}`
        : 'Gabarito: —'
      sectionChildren.push(
        new Paragraph({
          children: [
            new TextRun({ text: correctText, bold: true, size: 20, color: '1a7a3f' }),
          ],
          spacing: { before: 160, after: 80 },
          border: {
            left: { style: BorderStyle.SINGLE, size: 16, color: '1a7a3f', space: 6 },
          },
          shading: { fill: 'eef7ef' },
        })
      )
    }

    if (data.content.coment_alt && q.comments.length > 0) {
      sectionChildren.push(
        new Paragraph({
          children: [new TextRun({ text: 'Comentários por alternativa', bold: true, size: 20 })],
          spacing: { before: 160, after: 80 },
        })
      )
      for (const c of q.comments) {
        sectionChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${COMMENT_TYPE_LABEL[c.comment_type] ?? c.comment_type}: `,
                bold: true,
                size: 20,
              }),
              new TextRun({ text: c.content, size: 20 }),
            ],
            indent: { left: 240 },
            spacing: { after: 80 },
          })
        )
      }
    } else if (data.content.coment_compilado && q.comments.length > 0) {
      const merged = q.comments.map((c) => c.content).join('\n\n')
      sectionChildren.push(
        new Paragraph({
          children: [new TextRun({ text: 'Comentário compilado', bold: true, size: 20 })],
          spacing: { before: 160, after: 80 },
        }),
        new Paragraph({
          children: [new TextRun({ text: merged, size: 20 })],
          indent: { left: 240 },
          spacing: { after: 80 },
        })
      )
    }

    if (data.content.referencias && q.referencias.length > 0) {
      sectionChildren.push(
        new Paragraph({
          children: [new TextRun({ text: 'Referências', bold: true, size: 18 })],
          spacing: { before: 120, after: 60 },
        })
      )
      for (const ref of q.referencias) {
        sectionChildren.push(
          new Paragraph({
            children: [new TextRun({ text: `• ${ref.content}`, size: 18, color: '555555' })],
            indent: { left: 240 },
            spacing: { after: 40 },
          })
        )
      }
    }

    if (q.note) {
      sectionChildren.push(
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

  // Gabarito final em tabela
  if (data.content.gabarito && data.questions.length > 0) {
    const COLS = 5
    const rows: TableRow[] = []
    for (let i = 0; i < data.questions.length; i += COLS) {
      const chunk = data.questions.slice(i, i + COLS)
      const headerCells = chunk.map((q) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: `Q${q.position}`, bold: true, size: 18 })],
              alignment: AlignmentType.CENTER,
            }),
          ],
          width: { size: 20, type: WidthType.PERCENTAGE },
        })
      )
      const answerCells = chunk.map((q) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: q.correctAnswer ?? '—',
                  bold: true,
                  size: 18,
                  color: q.correctAnswer ? '1a7a3f' : '999999',
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
          width: { size: 20, type: WidthType.PERCENTAGE },
        })
      )
      while (headerCells.length < COLS) {
        headerCells.push(
          new TableCell({
            children: [new Paragraph({ children: [] })],
            width: { size: 20, type: WidthType.PERCENTAGE },
          })
        )
        answerCells.push(
          new TableCell({
            children: [new Paragraph({ children: [] })],
            width: { size: 20, type: WidthType.PERCENTAGE },
          })
        )
      }
      rows.push(new TableRow({ children: headerCells }))
      rows.push(new TableRow({ children: answerCells }))
    }
    sectionChildren.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        children: [new TextRun({ text: 'Gabarito', bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 300 },
      }),
      new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
    )
  }

  const doc = new Document({ sections: [{ children: sectionChildren }] })
  return Packer.toBuffer(doc)
}

// ============================================================
// PDF
// ============================================================
export async function buildPdfBuffer(data: ExportData): Promise<Uint8Array> {
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
        // hard split if a single word is too long
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
      x?: number
      size?: number
      bold?: boolean
      italic?: boolean
      color?: [number, number, number]
      indent?: number
      maxWidth?: number
      after?: number
      lineHeight?: number
    } = {}
  ) {
    const size = opts.size ?? 10
    const f = opts.bold ? fontBold : opts.italic ? fontItalic : font
    const color = opts.color ?? [0.1, 0.1, 0.15]
    const x = (opts.x ?? MARGIN) + (opts.indent ?? 0)
    const maxW = opts.maxWidth ?? CONTENT_W - (opts.indent ?? 0)
    const lh = opts.lineHeight ?? size * 1.35
    const lines = wrap(text, maxW, f, size)
    for (const line of lines) {
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

  // Header
  drawText(data.title, { size: 18, bold: true, after: 4 })
  if (data.subtitle) drawText(data.subtitle, { size: 10, color: [0.45, 0.45, 0.5], after: 8 })
  drawDivider([0.85, 0.7, 0.3])
  y -= 12

  for (let idx = 0; idx < data.questions.length; idx++) {
    const q = data.questions[idx]
    ensureSpace(40)
    drawText(`Questão ${idx + 1}  ·  Q${q.questionNumber}${q.examLabel ? `  ·  ${q.examLabel}` : ''}`, {
      size: 11,
      bold: true,
      color: [0.13, 0.13, 0.18],
      after: 4,
    })

    if (data.content.taxonomia && q.tags.length > 0) {
      drawText(q.tags.map((t) => `${t.dimension}: ${t.label}`).join('  ·  '), {
        size: 8,
        italic: true,
        color: [0.5, 0.5, 0.55],
        after: 2,
      })
    }

    if (data.content.enunciado && q.stem) {
      drawText(q.stem, { size: 10, after: 6 })
    }

    if (data.content.figuras && q.figures.length > 0) {
      for (const fig of q.figures) {
        try {
          let img
          if (fig.contentType.includes('png')) {
            img = await pdf.embedPng(fig.data)
          } else {
            img = await pdf.embedJpg(fig.data)
          }
          const maxW = 360
          const ratio = img.width / img.height
          const w = Math.min(maxW, img.width)
          const h = w / ratio
          ensureSpace(h + 10)
          const cx = MARGIN + (CONTENT_W - w) / 2
          page.drawImage(img, { x: cx, y: y - h, width: w, height: h })
          y -= h + 10
        } catch {
          // skip broken image
        }
      }
    }

    if (data.content.alternativas) {
      for (const letter of LETTERS) {
        const txt = q.alternatives[letter]
        if (!txt) continue
        const isCorrect = data.content.gabarito && q.correctAnswer === letter
        const f = fontBold
        const size = 10
        ensureSpace(size * 1.4)
        const labelText = `${letter}) `
        const labelW = f.widthOfTextAtSize(labelText, size)
        page.drawText(labelText, {
          x: MARGIN + 12,
          y: y - size,
          size,
          font: f,
          color: isCorrect ? rgb(0.1, 0.48, 0.25) : rgb(0.13, 0.13, 0.18),
        })
        const lines = wrap(txt, CONTENT_W - 12 - labelW, font, size)
        let first = true
        for (const line of lines) {
          if (!first) ensureSpace(size * 1.35)
          page.drawText(line, {
            x: first ? MARGIN + 12 + labelW : MARGIN + 12 + labelW,
            y: y - size,
            size,
            font,
            color: isCorrect ? rgb(0.1, 0.48, 0.25) : rgb(0.13, 0.13, 0.18),
          })
          y -= size * 1.35
          first = false
        }
        y -= 2
      }
    }

    if (data.content.gabarito) {
      const correctLetter = q.correctAnswer ?? '—'
      const correctTxt = q.correctAnswer && q.alternatives[q.correctAnswer]
        ? `Gabarito: ${correctLetter} — ${q.alternatives[q.correctAnswer]}`
        : `Gabarito: ${correctLetter}`
      drawText(correctTxt, {
        size: 10,
        bold: true,
        color: [0.1, 0.48, 0.25],
        indent: 8,
        after: 6,
      })
    }

    if (data.content.coment_alt && q.comments.length > 0) {
      drawText('Comentários por alternativa', { size: 10, bold: true, after: 2 })
      for (const c of q.comments) {
        const label = COMMENT_TYPE_LABEL[c.comment_type] ?? c.comment_type
        drawText(`${label}: ${c.content}`, { size: 9.5, indent: 14, after: 2 })
      }
    } else if (data.content.coment_compilado && q.comments.length > 0) {
      drawText('Comentário compilado', { size: 10, bold: true, after: 2 })
      drawText(q.comments.map((c) => c.content).join('\n\n'), { size: 9.5, indent: 14, after: 4 })
    }

    if (data.content.referencias && q.referencias.length > 0) {
      drawText('Referências', { size: 9.5, bold: true, after: 1 })
      for (const ref of q.referencias) {
        drawText(`• ${ref.content}`, { size: 9, indent: 14, color: [0.4, 0.4, 0.45], after: 1 })
      }
    }

    if (q.note) {
      drawText(`Nota: ${q.note}`, { size: 9, italic: true, color: [0.4, 0.4, 0.45], after: 4 })
    }

    y -= 6
    drawDivider()
    y -= 6
  }

  if (data.content.gabarito && data.questions.length > 0) {
    page = pdf.addPage([PAGE_W, PAGE_H])
    y = PAGE_H - MARGIN
    drawText('Gabarito', { size: 16, bold: true, after: 12 })
    const COLS = 5
    const cellW = CONTENT_W / COLS
    const cellH = 26
    let row = 0
    for (let i = 0; i < data.questions.length; i += COLS) {
      const chunk = data.questions.slice(i, i + COLS)
      ensureSpace(cellH * 2 + 4)
      // Headers
      for (let j = 0; j < COLS; j++) {
        const x = MARGIN + j * cellW
        page.drawRectangle({
          x,
          y: y - cellH,
          width: cellW,
          height: cellH,
          borderColor: rgb(0.85, 0.85, 0.88),
          borderWidth: 0.5,
          color: rgb(0.97, 0.97, 0.99),
        })
        const label = chunk[j] ? `Q${chunk[j].position}` : ''
        if (label) {
          const w = fontBold.widthOfTextAtSize(label, 10)
          page.drawText(label, {
            x: x + (cellW - w) / 2,
            y: y - cellH + 9,
            size: 10,
            font: fontBold,
            color: rgb(0.13, 0.13, 0.18),
          })
        }
      }
      y -= cellH
      // Answers
      for (let j = 0; j < COLS; j++) {
        const x = MARGIN + j * cellW
        page.drawRectangle({
          x,
          y: y - cellH,
          width: cellW,
          height: cellH,
          borderColor: rgb(0.85, 0.85, 0.88),
          borderWidth: 0.5,
        })
        const ans = chunk[j]?.correctAnswer ?? ''
        if (ans) {
          const w = fontBold.widthOfTextAtSize(ans, 11)
          page.drawText(ans, {
            x: x + (cellW - w) / 2,
            y: y - cellH + 9,
            size: 11,
            font: fontBold,
            color: rgb(0.1, 0.48, 0.25),
          })
        }
      }
      y -= cellH + 4
      row++
    }
  }

  return pdf.save()
}

// ============================================================
// XLSX
// ============================================================
export async function buildXlsxBuffer(data: ExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MedMaestro'
  wb.created = new Date()
  const ws = wb.addWorksheet('Questões', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  const cols: { header: string; key: string; width: number }[] = [{ header: '#', key: 'pos', width: 5 }]
  cols.push({ header: 'Questão', key: 'qnum', width: 10 })
  cols.push({ header: 'Prova', key: 'exam', width: 18 })
  if (data.content.enunciado) cols.push({ header: 'Enunciado', key: 'stem', width: 80 })
  if (data.content.alternativas) {
    for (const l of LETTERS) cols.push({ header: l, key: `alt_${l}`, width: 40 })
  }
  if (data.content.gabarito) cols.push({ header: 'Gabarito', key: 'correct', width: 10 })
  if (data.content.taxonomia) cols.push({ header: 'Tags', key: 'tags', width: 40 })
  if (data.content.coment_alt || data.content.coment_compilado) {
    cols.push({ header: 'Comentários', key: 'comments', width: 80 })
  }
  if (data.content.referencias) cols.push({ header: 'Referências', key: 'refs', width: 60 })

  ws.columns = cols

  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FF111D35' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF5E9C8' },
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.height = 22

  for (const q of data.questions) {
    const row: Record<string, unknown> = {
      pos: q.position,
      qnum: `Q${q.questionNumber}`,
      exam: q.examLabel,
    }
    if (data.content.enunciado) row.stem = q.stem
    if (data.content.alternativas) {
      for (const l of LETTERS) row[`alt_${l}`] = q.alternatives[l] ?? ''
    }
    if (data.content.gabarito) row.correct = q.correctAnswer ?? ''
    if (data.content.taxonomia) {
      row.tags = q.tags.map((t) => `${t.dimension}: ${t.label}`).join(' · ')
    }
    if (data.content.coment_alt || data.content.coment_compilado) {
      row.comments = q.comments
        .map((c) => `[${COMMENT_TYPE_LABEL[c.comment_type] ?? c.comment_type}] ${c.content}`)
        .join('\n')
    }
    if (data.content.referencias) {
      row.refs = q.referencias.map((r) => r.content).join('\n')
    }
    const r = ws.addRow(row)
    r.alignment = { vertical: 'top', wrapText: true }
  }

  // Auto-fit row height (best effort)
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return
    row.height = 60
  })

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf as ArrayBuffer)
}
