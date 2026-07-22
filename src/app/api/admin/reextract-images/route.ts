import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { reextractQuestionImages, type ReextractResult } from '@/lib/extrator/core/pipeline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function checkAuth(request: Request): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return false // fail-closed: sem secret configurado, nega (não expõe o endpoint)
  return request.headers.get('authorization') === `Bearer ${secret}`
}

type Body = {
  question_id?: string
  exam_id?: string
  all_with_images?: boolean
  dry_run?: boolean
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const supabase = createServiceClient()
  let targets: { id: string; question_number: number; exam_id: string }[] = []

  if (body.question_id) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, question_number, exam_id')
      .eq('id', body.question_id)
      .single()
    if (error || !data) {
      return NextResponse.json({ error: `Questão não encontrada: ${error?.message ?? 'no row'}` }, { status: 404 })
    }
    targets = [data as typeof targets[number]]
  } else if (body.exam_id || body.all_with_images) {
    let q = supabase
      .from('questions')
      .select('id, question_number, exam_id')
      .eq('has_images', true)
      .order('question_number', { ascending: true })
    if (body.exam_id) q = q.eq('exam_id', body.exam_id)
    const { data, error } = await q
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    targets = (data ?? []) as typeof targets
  } else {
    return NextResponse.json(
      { error: 'Forneça question_id, exam_id, ou all_with_images=true' },
      { status: 400 }
    )
  }

  if (body.dry_run) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      count: targets.length,
      targets: targets.map((t) => ({ id: t.id, question_number: t.question_number, exam_id: t.exam_id })),
    })
  }

  // Cache de PDF por exame: o mesmo caderno é baixado UMA vez, não uma vez por
  // questão (num lote de 90 questões, eram 90 downloads idênticos).
  const pdfByExam = new Map<string, Buffer | null>()
  async function pdfForExam(examId: string): Promise<Buffer | undefined> {
    if (pdfByExam.has(examId)) return pdfByExam.get(examId) ?? undefined
    const { data: exam } = await supabase
      .from('exams')
      .select('source_pdf_path')
      .eq('id', examId)
      .single()
    const path = exam?.source_pdf_path as string | null
    if (!path) {
      pdfByExam.set(examId, null)
      return undefined
    }
    const { data: fileData } = await supabase.storage.from('exam-pdfs').download(path)
    const buf = fileData ? Buffer.from(await fileData.arrayBuffer()) : null
    pdfByExam.set(examId, buf)
    return buf ?? undefined
  }

  const results: ReextractResult[] = []
  for (const t of targets) {
    const pdfBuffer = await pdfForExam(t.exam_id)
    const r = await reextractQuestionImages(t.id, pdfBuffer ? { pdfBuffer } : undefined)
    results.push(r)
  }

  const ok = results.filter((r) => r.ok).length
  const failed = results.length - ok

  return NextResponse.json({
    ok: failed === 0,
    processed: results.length,
    succeeded: ok,
    failed,
    results,
  })
}
