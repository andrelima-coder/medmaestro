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

  // 1. Busca questão original
  const { data: question, error: qErr } = await supabase
    .from('questions')
    .select(
      'id, question_no, exam_id, stem, alternative_a, alternative_b, alternative_c, alternative_d, alternative_e'
    )
    .eq('id', question_id)
    .single()

  if (qErr || !question) {
    return NextResponse.json({ error: 'Questão não encontrada' }, { status: 404 })
  }

  // 2. Determina novo question_no
  const { data: maxRow } = await supabase
    .from('questions')
    .select('question_no')
    .eq('exam_id', question.exam_id)
    .order('question_no', { ascending: false })
    .limit(1)
    .single()

  const newQuestionNo = (maxRow?.question_no ?? 0) + 1

  // 3. Monta prompt
  const prompt = `Você é um professor de medicina intensiva. Crie uma variante didática desta questão com um cenário clínico diferente, mas que teste o mesmo conhecimento e objetivo de aprendizagem. Use português, nível UTI.

Questão original: ${question.stem}
A) ${question.alternative_a ?? ''}
B) ${question.alternative_b ?? ''}
C) ${question.alternative_c ?? ''}
D) ${question.alternative_d ?? ''}
E) ${question.alternative_e ?? ''}

Retorne APENAS JSON (sem markdown):
{
  "stem": "enunciado da variante",
  "alternatives": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." },
  "correct": "A",
  "rationale": "breve justificativa da alternativa correta"
}`

  // 4. Chama Claude Opus
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

  // 5. Valida correct answer
  const correctAnswer = generated.correct?.toUpperCase()
  if (!correctAnswer || !/^[A-E]$/.test(correctAnswer)) {
    return NextResponse.json({ error: 'Resposta correta inválida retornada pelo modelo' }, { status: 500 })
  }

  // 6. Insere nova questão
  const { data: inserted, error: insertErr } = await supabase
    .from('questions')
    .insert({
      exam_id: question.exam_id,
      question_no: newQuestionNo,
      stem: generated.stem,
      alternative_a: generated.alternatives['A'] ?? null,
      alternative_b: generated.alternatives['B'] ?? null,
      alternative_c: generated.alternatives['C'] ?? null,
      alternative_d: generated.alternatives['D'] ?? null,
      alternative_e: generated.alternatives['E'] ?? null,
      correct_answer: correctAnswer,
      has_image: false,
      confidence_score: 0.8,
      extraction_model: MODELS.opus,
      status: 'extracted',
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
    new_question_no: newQuestionNo,
  })
}
