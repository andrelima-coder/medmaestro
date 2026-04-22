import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { complete, parseJSON, MODELS } from '@/lib/ai/claude'

function checkAuth(request: Request): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

type GeneratedQuestion = {
  stem: string
  alternatives: Record<string, string>
  correct: string
  rationale: string
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

  const supabase = createServiceClient()

  const { data: question, error: qErr } = await supabase
    .from('questions')
    .select('id, question_number, exam_id, stem, alternatives')
    .eq('id', question_id)
    .single()

  if (qErr || !question) {
    return NextResponse.json({ error: 'Questão não encontrada' }, { status: 404 })
  }

  const alts = (question.alternatives as Record<string, string> | null) ?? {}

  const { data: maxRow } = await supabase
    .from('questions')
    .select('question_number')
    .eq('exam_id', question.exam_id)
    .order('question_number', { ascending: false })
    .limit(1)
    .single()

  const newQuestionNumber = ((maxRow?.question_number as number | null) ?? 0) + 1

  const prompt = `Você é um professor de medicina intensiva. Crie uma variante didática desta questão com um cenário clínico diferente, mas que teste o mesmo conhecimento e objetivo de aprendizagem. Use português, nível UTI.

Questão original: ${question.stem}
A) ${alts['A'] ?? ''}
B) ${alts['B'] ?? ''}
C) ${alts['C'] ?? ''}
D) ${alts['D'] ?? ''}
E) ${alts['E'] ?? ''}

Retorne APENAS JSON (sem markdown):
{
  "stem": "enunciado da variante",
  "alternatives": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." },
  "correct": "A",
  "rationale": "breve justificativa da alternativa correta"
}`

  let generated: GeneratedQuestion
  try {
    const raw = await complete({
      model: MODELS.opus,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1536,
    })
    generated = parseJSON<GeneratedQuestion>(raw)
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao gerar variante: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }

  const correctAnswer = generated.correct?.toUpperCase()
  if (!correctAnswer || !/^[A-E]$/.test(correctAnswer)) {
    return NextResponse.json({ error: 'Resposta correta inválida retornada pelo modelo' }, { status: 500 })
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('questions')
    .insert({
      exam_id: question.exam_id,
      question_number: newQuestionNumber,
      stem: generated.stem,
      alternatives: generated.alternatives,
      correct_answer: correctAnswer,
      has_images: false,
      extraction_confidence: 80,
      status: 'pending_extraction',
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: `Falha ao salvar variante: ${insertErr?.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    new_question_id: inserted.id,
    new_question_number: newQuestionNumber,
  })
}
