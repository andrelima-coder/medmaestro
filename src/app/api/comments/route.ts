import { NextResponse } from 'next/server'
import { generateComment } from '@/lib/extraction/pipeline'

function checkAuth(request: Request): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: { question_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { question_id } = body
  if (!question_id) {
    return NextResponse.json({ error: 'question_id é obrigatório' }, { status: 400 })
  }

  try {
    await generateComment(question_id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao gerar comentário: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
