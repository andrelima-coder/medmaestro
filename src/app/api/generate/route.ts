import { NextResponse } from 'next/server'
import { generateVariationsForQuestion } from '@/lib/variations/generate'

// AUDITORIA 2026-07: este endpoint inseria variações DIRETO em `questions`
// (status 'draft', question_number = max+1 colidindo com a numeração real,
// extraction_confidence 80 — que viola o CHECK 1–5 do banco) usando Opus
// hardcoded (~5× o custo do Sonnet), sem gate de revisão humana.
// Agora delega ao pipeline oficial: question_variations → revisão → promoção.
function checkAuth(request: Request): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return false // fail-closed: sem secret configurado, nega (não expõe o endpoint)
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: { question_id?: string; count?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { question_id } = body
  if (!question_id) {
    return NextResponse.json({ error: 'question_id é obrigatório' }, { status: 400 })
  }

  const result = await generateVariationsForQuestion(question_id, {
    count: Math.max(1, Math.min(5, body.count ?? 1)),
    difficultyDelta: 0,
    inheritTags: true,
    model: 'sonnet',
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Falha ao gerar variação' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    created: result.created,
    note: 'Variações criadas em question_variations — aprovar/promover em /revisao-variacoes.',
  })
}
