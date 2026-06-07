'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { uploadFile } from '@/lib/storage/signed-urls'
import { logAudit } from '@/lib/audit'
import { parseGabaritoForExam } from '@/lib/gabarito/run'
import { convertToPdf, OfficeConversionError } from '@/lib/office/convert'
import {
  CADERNO_EXTS,
  CADERNO_MAX_BYTES,
  GABARITO_MAX_BYTES,
  extOf,
  isOfficeExt,
  mimeForExt,
  sourceFormatForExt,
} from '@/lib/uploads/file-types'

export type CreateExamState = {
  error?: string
  examId?: string
}

export async function createExamAction(
  _prev: CreateExamState,
  formData: FormData
): Promise<CreateExamState> {
  const boardId = formData.get('board_id') as string | null
  const specialtyId = formData.get('specialty_id') as string | null
  const yearRaw = formData.get('year') as string | null
  const colorRaw = (formData.get('color') as string | null)?.toLowerCase().trim() || null
  // answer_key_color: empty string → null (gabarito sem cor ou não informado)
  const answerKeyColorRaw = (formData.get('answer_key_color') as string | null)?.toLowerCase().trim() || null
  const autoComments = (formData.get('auto_comments') as string | null) ?? 'none'
  const pdfProva = formData.get('pdf_prova') as File | null
  const pdfGabarito = formData.get('pdf_gabarito') as File | null

  if (!boardId) return { error: 'Banca é obrigatória.' }
  if (!specialtyId) return { error: 'Especialidade não pôde ser derivada da banca selecionada.' }
  if (!yearRaw) return { error: 'Ano é obrigatório.' }

  const year = parseInt(yearRaw, 10)
  if (isNaN(year) || year < 2000 || year > 2050) {
    return { error: 'Ano inválido (deve ser entre 2000 e 2050).' }
  }

  if (!pdfProva || pdfProva.size === 0) {
    return { error: 'O caderno da prova é obrigatório.' }
  }

  const provaExt = extOf(pdfProva.name)
  if (!CADERNO_EXTS.includes(provaExt)) {
    return { error: 'Formato do caderno inválido. Use PDF, DOCX ou PPTX.' }
  }
  if (pdfProva.size > CADERNO_MAX_BYTES) {
    return { error: `Caderno maior que ${Math.round(CADERNO_MAX_BYTES / 1024 / 1024)} MB.` }
  }
  if (pdfGabarito && pdfGabarito.size > GABARITO_MAX_BYTES) {
    return { error: `Gabarito maior que ${Math.round(GABARITO_MAX_BYTES / 1024 / 1024)} MB.` }
  }

  // Autentica usuário
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const supabase = createServiceClient()

  // Verifica se a banca existe + se suporta cores
  const { data: board, error: boardErr } = await supabase
    .from('exam_boards')
    .select('id, supports_booklet_colors')
    .eq('id', boardId)
    .single()

  if (boardErr || !board) {
    return { error: 'Banca inválida.' }
  }

  const requiresColor = board.supports_booklet_colors ?? true
  if (requiresColor && !colorRaw) {
    return { error: 'Cor do caderno é obrigatória para esta banca.' }
  }

  const bookletColor = requiresColor ? colorRaw : null

  // Deriva slug da especialidade para o path de storage
  const { data: specialty, error: spErr } = await supabase
    .from('specialties')
    .select('slug')
    .eq('id', specialtyId)
    .single()

  if (spErr || !specialty) return { error: 'Especialidade não encontrada.' }

  const slug = specialty.slug
  const basePath = bookletColor
    ? `${slug}/${year}/${bookletColor}`
    : `${slug}/${year}`

  // Upload do caderno. PDF entra direto; DOCX/PPTX são convertidos para PDF
  // (Gotenberg) para reusar todo o pipeline de extração, mas o original é
  // preservado em storage para reprocessamento/auditoria.
  const sourceFormat = sourceFormatForExt(provaExt)
  let pdfPath: string
  let sourceOriginalPath: string | null = null
  try {
    const provaBuffer = Buffer.from(await pdfProva.arrayBuffer())

    if (isOfficeExt(provaExt)) {
      // Preserva o original (…/prova.docx | …/prova.pptx)
      sourceOriginalPath = await uploadFile(
        'exam-pdfs',
        `${basePath}/prova.${provaExt}`,
        provaBuffer,
        mimeForExt(provaExt)
      )
      // Converte e grava o PDF derivado que o pipeline vai consumir
      const convertedPdf = await convertToPdf(provaBuffer, pdfProva.name, provaExt)
      pdfPath = await uploadFile('exam-pdfs', `${basePath}/prova.pdf`, convertedPdf, 'application/pdf')
    } else {
      pdfPath = await uploadFile('exam-pdfs', `${basePath}/prova.pdf`, provaBuffer, 'application/pdf')
    }
  } catch (err) {
    if (err instanceof OfficeConversionError) {
      return { error: err.message }
    }
    return {
      error: `Falha ao enviar o caderno: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Upload do gabarito (opcional, aceita múltiplos formatos)
  let gabaritoPath: string | null = null
  if (pdfGabarito && pdfGabarito.size > 0) {
    const ext = extOf(pdfGabarito.name) || 'pdf'
    const mime = mimeForExt(ext)
    try {
      const gabaritoBuffer = Buffer.from(await pdfGabarito.arrayBuffer())
      gabaritoPath = await uploadFile(
        'exam-pdfs',
        `${basePath}/gabarito.${ext}`,
        gabaritoBuffer,
        mime
      )
    } catch (err) {
      return {
        error: `Falha ao enviar gabarito: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  const { data: exam, error: examErr } = await supabase
    .from('exams')
    .upsert(
      {
        board_id: boardId,
        specialty_id: specialtyId,
        year,
        booklet_color: bookletColor,
        source_pdf_path: pdfPath,
        source_format: sourceFormat,
        source_original_path: sourceOriginalPath,
        answer_key_pdf_path: gabaritoPath,
        answer_key_color: answerKeyColorRaw,
        auto_comments: autoComments,
        created_by: user.id,
      },
      { onConflict: 'board_id,specialty_id,year,booklet_color' }
    )
    .select('id')
    .single()

  if (examErr || !exam) {
    return { error: `Falha ao criar exame: ${examErr?.message}` }
  }

  await logAudit(user.id, 'exam', exam.id, 'exam_uploaded', null, {
    specialty_id: specialtyId,
    year,
    booklet_color: bookletColor,
    answer_key_color: answerKeyColorRaw,
    pdf_path: pdfPath,
    source_format: sourceFormat,
    source_original_path: sourceOriginalPath,
    has_gabarito: !!gabaritoPath,
    auto_comments: autoComments,
  })

  // Dispara parse do gabarito em background (após resposta enviada)
  if (gabaritoPath && bookletColor) {
    const examIdForParse = exam.id as string
    after(async () => {
      await parseGabaritoForExam(examIdForParse, bookletColor).catch(() => null)
    })
  }

  return { examId: exam.id }
}
