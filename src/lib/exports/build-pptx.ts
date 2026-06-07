import pptxgen from 'pptxgenjs'
import type { ExportData, QuestionData } from '@/lib/exports/build'
import { splitFiguresByScope } from '@/lib/exports/build'

// Paleta MedMaestro (dark)
const BG = '0A0A0A'
const PANEL = '111D35'
const GOLD = 'C9A84C'
const ORANGE = 'FF6B35'
const GREEN = '66BB6A'
const TEXT = 'F2F2F2'
const MUTED = '9AA0AA'

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

const TEACHER_TIP_HEADERS = new Set([
  'Objetivo de aprendizado',
  'Conceito central',
  'Erros comuns dos alunos',
  'O que enfatizar em aula',
  'Como conduzir a discussão',
])

function dataUri(contentType: string, bytes: Uint8Array): string {
  const ct = contentType && contentType.startsWith('image/') ? contentType : 'image/jpeg'
  const base64 = Buffer.from(bytes).toString('base64')
  return `data:${ct};base64,${base64}`
}

/**
 * Slides de aula a partir das questões filtradas/simulado.
 * Layout 16:9. Por questão: slide de questão (+figura) e, se pedido, slide de
 * gabarito/comentário e slide "Para o professor".
 */
export async function buildPptxBuffer(data: ExportData): Promise<Uint8Array> {
  const pptx = new pptxgen()
  pptx.defineLayout({ name: 'MM', width: 13.33, height: 7.5 })
  pptx.layout = 'MM'
  pptx.author = 'MedMaestro'
  pptx.company = 'MedMaestro'

  // ---- Slide de capa ----
  const cover = pptx.addSlide()
  cover.background = { color: BG }
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 3.05, w: 13.33, h: 0.04, fill: { color: GOLD } })
  cover.addText(data.title, {
    x: 0.8, y: 2.1, w: 11.7, h: 0.9,
    fontFace: 'Arial', fontSize: 34, bold: true, color: TEXT, align: 'center',
  })
  cover.addText(data.subtitle ?? `${data.questions.length} questões`, {
    x: 0.8, y: 3.25, w: 11.7, h: 0.5,
    fontFace: 'Arial', fontSize: 16, color: GOLD, align: 'center',
  })
  cover.addText('MedMaestro · Material de apoio ao professor', {
    x: 0.8, y: 6.7, w: 11.7, h: 0.4,
    fontFace: 'Arial', fontSize: 11, color: MUTED, align: 'center',
  })

  const c = data.content
  data.questions.forEach((q) => {
    addQuestionSlide(pptx, q, c.enunciado, c.alternativas, c.figuras, c.gabarito)
    if (c.gabarito || c.coment_alt || c.coment_compilado) {
      addAnswerSlide(pptx, q, c.coment_alt, c.coment_compilado)
    }
    if (c.dica_professor && q.teacherTips.length > 0) {
      addTeacherSlide(pptx, q)
    }
  })

  const out = await pptx.write({ outputType: 'nodebuffer' })
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer)
}

function header(slide: pptxgen.Slide, pptx: pptxgen, q: QuestionData, suffix?: string) {
  const meta = [q.examLabel, `Q${q.questionNumber}`].filter(Boolean).join(' · ')
  slide.addText(
    [
      { text: `Questão ${q.position}`, options: { color: GOLD, bold: true } },
      ...(meta ? [{ text: `   ${meta}`, options: { color: MUTED, fontSize: 13 } }] : []),
      ...(suffix ? [{ text: `   ·  ${suffix}`, options: { color: ORANGE, fontSize: 13 } }] : []),
    ],
    { x: 0.6, y: 0.4, w: 12.1, h: 0.5, fontFace: 'Arial', fontSize: 18 }
  )
  slide.addShape(pptx.ShapeType.line, {
    x: 0.6, y: 0.95, w: 12.1, h: 0,
    line: { color: '222a3a', width: 1 },
  })
}

function addQuestionSlide(
  pptx: pptxgen,
  q: QuestionData,
  showStem: boolean,
  showAlts: boolean,
  showFigures: boolean,
  showGabarito: boolean
) {
  const slide = pptx.addSlide()
  slide.background = { color: BG }
  header(slide, pptx, q)

  const { statement: stmtFigs, byAlt: altFigs } = splitFiguresByScope(q.figures)
  const altFigEntries = LETTERS.filter((l) => (altFigs[l]?.length ?? 0) > 0).map((l) => ({
    letter: l,
    fig: altFigs[l][0],
  }))
  const hasStmtFig = showFigures && stmtFigs.length > 0
  const hasAltFigs = showFigures && altFigEntries.length > 0
  const hasFigure = hasStmtFig || hasAltFigs
  const textW = hasFigure ? 7.4 : 12.1

  if (showStem && q.stem) {
    slide.addText(q.stem, {
      x: 0.6, y: 1.2, w: textW, h: 2.6,
      fontFace: 'Arial', fontSize: 16, color: TEXT, valign: 'top', autoFit: true,
    })
  }

  if (showAlts) {
    const present = LETTERS.filter((l) => (q.alternatives[l] ?? '').trim().length > 0)
    const altRuns = present.map((l) => {
      const isCorrect = showGabarito && q.correctAnswer === l
      return {
        text: `${l}) ${q.alternatives[l]}`,
        options: {
          color: isCorrect ? GREEN : TEXT,
          bold: isCorrect,
          bullet: false,
          breakLine: true,
        },
      }
    })
    slide.addText(altRuns, {
      x: 0.6, y: showStem && q.stem ? 3.95 : 1.2, w: textW, h: 3.0,
      fontFace: 'Arial', fontSize: 14, color: TEXT, valign: 'top', lineSpacingMultiple: 1.1,
    })
  }

  if (hasFigure) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 8.25, y: 1.2, w: 4.45, h: 5.0, fill: { color: PANEL }, line: { color: '2a3550', width: 1 },
    })
    if (hasAltFigs) {
      // Alternativas em imagem: grade 2 colunas, cada figura rotulada (A–D).
      const cols = 2
      const cellW = 2.0
      const cellH = 2.3
      const gx = 8.45
      const gy = 1.4
      altFigEntries.forEach((e, i) => {
        const r = Math.floor(i / cols)
        const c = i % cols
        const x = gx + c * (cellW + 0.1)
        const yy = gy + r * (cellH + 0.1)
        const isCorrect = showGabarito && q.correctAnswer === e.letter
        slide.addText(`${e.letter})`, {
          x, y: yy, w: 0.6, h: 0.28,
          fontFace: 'Arial', fontSize: 12, bold: true, color: isCorrect ? GREEN : TEXT,
        })
        slide.addImage({
          data: dataUri(e.fig.contentType, e.fig.data),
          x, y: yy + 0.28, w: cellW, h: cellH - 0.28,
          sizing: { type: 'contain', w: cellW, h: cellH - 0.28 },
        })
      })
    } else {
      const fig = stmtFigs[0]
      slide.addImage({
        data: dataUri(fig.contentType, fig.data),
        x: 8.45, y: 1.4, w: 4.05, h: 4.6,
        sizing: { type: 'contain', w: 4.05, h: 4.6 },
      })
    }
  }
}

function addAnswerSlide(
  pptx: pptxgen,
  q: QuestionData,
  showCommentAlt: boolean,
  showCommentMerged: boolean
) {
  const slide = pptx.addSlide()
  slide.background = { color: BG }
  header(slide, pptx, q, 'Gabarito e comentário')

  const correct = q.correctAnswer ?? '—'
  const correctText =
    q.correctAnswer && q.alternatives[q.correctAnswer]
      ? `Gabarito: ${correct} — ${q.alternatives[q.correctAnswer]}`
      : `Gabarito: ${correct}`
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.6, y: 1.2, w: 12.1, h: 0.7, fill: { color: '12251a' }, line: { color: GREEN, width: 1 },
  })
  slide.addText(correctText, {
    x: 0.8, y: 1.2, w: 11.7, h: 0.7,
    fontFace: 'Arial', fontSize: 16, bold: true, color: GREEN, valign: 'middle',
  })

  const comments = q.comments
  if ((showCommentAlt || showCommentMerged) && comments.length > 0) {
    const merged = comments.map((cm) => cm.content).join('\n\n')
    slide.addText(merged, {
      x: 0.6, y: 2.1, w: 12.1, h: 4.9,
      fontFace: 'Arial', fontSize: 12, color: TEXT, valign: 'top', autoFit: true,
    })
  }
}

function addTeacherSlide(pptx: pptxgen, q: QuestionData) {
  const slide = pptx.addSlide()
  slide.background = { color: BG }
  header(slide, pptx, q, 'Para o professor')

  slide.addText('🎓 Para o professor', {
    x: 0.6, y: 1.05, w: 12.1, h: 0.45,
    fontFace: 'Arial', fontSize: 18, bold: true, color: GOLD,
  })

  const runs: pptxgen.TextProps[] = []
  for (const tip of q.teacherTips) {
    for (const line of tip.content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const isHeader = TEACHER_TIP_HEADERS.has(trimmed)
      runs.push({
        text: trimmed,
        options: {
          color: isHeader ? GOLD : TEXT,
          bold: isHeader,
          fontSize: isHeader ? 14 : 12,
          breakLine: true,
          paraSpaceBefore: isHeader ? 8 : 0,
          indentLevel: isHeader ? 0 : 1,
        },
      })
    }
  }
  slide.addText(runs, {
    x: 0.6, y: 1.6, w: 12.1, h: 5.4,
    fontFace: 'Arial', valign: 'top', lineSpacingMultiple: 1.05,
  })
}
