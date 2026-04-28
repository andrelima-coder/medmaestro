import { NextResponse } from 'next/server'
import { parseGabaritoForExam } from '@/lib/gabarito/run'

function checkAuth(request: Request): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: { exam_id?: string; booklet_color?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { exam_id, booklet_color } = body
  if (!exam_id || !booklet_color) {
    return NextResponse.json(
      { error: 'exam_id e booklet_color são obrigatórios' },
      { status: 400 }
    )
  }

  const result = await parseGabaritoForExam(exam_id, booklet_color)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    ok: true,
    questions_saved: result.questions_saved,
    correct_answers_synced: result.correct_answers_synced,
    alteracoes_applied: result.alteracoes_applied,
  })
}
