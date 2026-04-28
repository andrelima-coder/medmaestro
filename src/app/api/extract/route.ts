import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runExtractionPipeline } from '@/lib/extraction/pipeline'

function checkAuth(request: Request): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: { exam_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { exam_id } = body
  if (!exam_id) {
    return NextResponse.json({ error: 'exam_id é obrigatório' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: exam, error: examError } = await supabase
    .from('exams')
    .select('id, source_pdf_path')
    .eq('id', exam_id)
    .single()

  if (examError || !exam) {
    return NextResponse.json({ error: 'Exame não encontrado' }, { status: 404 })
  }
  if (!exam.source_pdf_path) {
    return NextResponse.json({ error: 'Exame não possui PDF da prova' }, { status: 422 })
  }

  await supabase.from('exams').update({ status: 'extracting' }).eq('id', exam_id)

  runExtractionPipeline(exam_id).catch(async () => {
    await supabase.from('exams').update({ status: 'error' }).eq('id', exam_id)
  })

  return NextResponse.json({ ok: true, queued: true }, { status: 202 })
}
