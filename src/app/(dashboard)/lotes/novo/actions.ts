'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { uploadFile } from '@/lib/storage/signed-urls'
import { logAudit } from '@/lib/audit'
import { parseGabaritoForExam } from '@/lib/gabarito/run'

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
    return { error: 'PDF da prova é obrigatório.' }
  }

  // Autentica usuário
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const supabase = createServiceClient()

  // Verifica se a banca suporta cores
  const { data: board } = await supabase
    .from('exam_boards')
    .select('supports_booklet_colors')
    .eq('id', boardId)
    .single()

  const requiresColor = board?.supports_booklet_colors ?? true
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

  // Upload PDF da prova
  let pdfPath: string
  try {
    const provaBuffer = Buffer.from(await pdfProva.arrayBuffer())
    pdfPath = await uploadFile('exam-pdfs', `${basePath}/prova.pdf`, provaBuffer, 'application/pdf')
  } catch (err) {
    return {
      error: `Falha ao enviar PDF da prova: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Upload do gabarito (opcional, aceita múltiplos formatos)
  let gabaritoPath: string | null = null
  if (pdfGabarito && pdfGabarito.size > 0) {
    const ext = pdfGabarito.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
      md: 'text/markdown',
    }
    const mime = mimeMap[ext] ?? 'application/octet-stream'
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
