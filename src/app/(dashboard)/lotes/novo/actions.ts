'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { uploadFile } from '@/lib/storage/signed-urls'

export type CreateExamState = {
  error?: string
  examId?: string
}

export async function createExamAction(
  _prev: CreateExamState,
  formData: FormData
): Promise<CreateExamState> {
  const specialtyId = formData.get('specialty_id') as string | null
  const yearRaw = formData.get('year') as string | null
  const color = (formData.get('color') as string | null)?.toUpperCase()
  const pdfProva = formData.get('pdf_prova') as File | null
  const pdfGabarito = formData.get('pdf_gabarito') as File | null

  if (!specialtyId || !yearRaw || !color) {
    return { error: 'Especialidade, ano e cor são obrigatórios.' }
  }

  const year = parseInt(yearRaw, 10)
  if (isNaN(year) || year < 2000 || year > 2050) {
    return { error: 'Ano inválido (deve ser entre 2000 e 2050).' }
  }

  if (!pdfProva || pdfProva.size === 0) {
    return { error: 'PDF da prova é obrigatório.' }
  }

  const supabase = createServiceClient()

  // Busca specialty slug para compor o path
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
        specialty_id: specialtyId,
        year,
        color: color.toLowerCase(),
        pdf_path: pdfPath,
        gabarito_path: gabaritoPath,
        status: 'pending',
      },
      { onConflict: 'specialty_id,year,color' }
    )
    .select('id')
    .single()

  if (examErr || !exam) {
    return { error: `Falha ao criar exame: ${examErr?.message}` }
  }

  // Dispara parse-gabarito em background (síncrono, rápido) se gabarito foi enviado
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
      // Não bloqueia o fluxo — gabarito pode ser processado depois
    }
  }

  return { examId: exam.id }
}
