'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { uploadFile } from '@/lib/storage/signed-urls'
import { logAudit } from '@/lib/audit'

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
  const color = (formData.get('color') as string | null)?.toUpperCase()
  const pdfProva = formData.get('pdf_prova') as File | null
  const pdfGabarito = formData.get('pdf_gabarito') as File | null

  if (!boardId || !specialtyId || !yearRaw || !color) {
    return { error: 'Banca, especialidade, ano e cor são obrigatórios.' }
  }

  const year = parseInt(yearRaw, 10)
  if (isNaN(year) || year < 2000 || year > 2050) {
    return { error: 'Ano inválido (deve ser entre 2000 e 2050).' }
  }

  if (!pdfProva || pdfProva.size === 0) {
    return { error: 'PDF da prova é obrigatório.' }
  }

  // Autentica usuário para rastreabilidade
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const supabase = createServiceClient()

  const { data: specialty, error: spErr } = await supabase
    .from('specialties')
    .select('slug')
    .eq('id', specialtyId)
    .single()

  if (spErr || !specialty) {
    return { error: 'Especialidade não encontrada.' }
  }

  const slug = specialty.slug
  const basePath = `${slug}/${year}/${color.toLowerCase()}`

  // Upload PDF da prova
  let pdfPath: string
  try {
    const provaBuffer = Buffer.from(await pdfProva.arrayBuffer())
    pdfPath = await uploadFile('exam-pdfs', `${basePath}/prova.pdf`, provaBuffer, 'application/pdf')
  } catch (err) {
    return { error: `Falha ao enviar PDF da prova: ${err instanceof Error ? err.message : String(err)}` }
  }

  // Upload PDF do gabarito (opcional)
  let gabaritoPath: string | null = null
  if (pdfGabarito && pdfGabarito.size > 0) {
    try {
      const gabaritoBuffer = Buffer.from(await pdfGabarito.arrayBuffer())
      gabaritoPath = await uploadFile(
        'exam-pdfs',
        `${basePath}/gabarito.pdf`,
        gabaritoBuffer,
        'application/pdf'
      )
    } catch (err) {
      return { error: `Falha ao enviar PDF do gabarito: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  // Cria ou atualiza o exame no banco
  const { data: exam, error: examErr } = await supabase
    .from('exams')
    .upsert(
      {
        board_id: boardId,
        specialty_id: specialtyId,
        year,
        booklet_color: color.toLowerCase(),
        source_pdf_path: pdfPath,
        answer_key_pdf_path: gabaritoPath,
        created_by: user.id,
      },
      { onConflict: 'board_id,specialty_id,year,booklet_color' }
    )
    .select('id')
    .single()

  if (examErr || !exam) {
    return { error: `Falha ao criar exame: ${examErr?.message}` }
  }

  // Log de auditoria — quem fez upload de qual prova
  await logAudit(user.id, 'exam', exam.id, 'exam_uploaded', null, {
    specialty_id: specialtyId,
    year,
    booklet_color: color.toLowerCase(),
    pdf_path: pdfPath,
    has_gabarito: !!gabaritoPath,
  })

  // Dispara parse-gabarito em background se gabarito foi enviado
  if (gabaritoPath) {
    const workerSecret = process.env.WORKER_SECRET ?? ''
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      await fetch(`${baseUrl}/api/parse-gabarito`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerSecret}`,
        },
        body: JSON.stringify({ exam_id: exam.id, booklet_color: color }),
      })
    } catch {
      // Não bloqueia o fluxo
    }
  }

  return { examId: exam.id }
}
