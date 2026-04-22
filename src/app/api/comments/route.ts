import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { complete, MODELS } from '@/lib/ai/claude'

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

  const supabase = createServiceClient()

  // 1. Busca questão
  const { data: question, error: qErr } = await supabase
    .from('questions')
    .select('id, question_number, exam_id, stem, alternatives, correct_answer')
    .eq('id', question_id)
    .single()

  if (qErr || !question) {
    return NextResponse.json({ error: 'Questão não encontrada' }, { status: 404 })
  }

  const alternatives = (question.alternatives as Record<string, string> | null) ?? {}

  // 2. Tenta obter gabarito — primeiro em questions.correct_answer, depois em answer_keys
  let correctAnswer: string = question.correct_answer ?? ''
  if (!correctAnswer) {
    const { data: ak } = await supabase
      .from('answer_keys')
      .select('correct_answer')
      .eq('exam_id', question.exam_id)
      .eq('question_number', question.question_number)
      .single()
    correctAnswer = ak?.correct_answer ?? ''
  }

  const gabaritoText = correctAnswer
    ? `Gabarito: ${correctAnswer}`
    : 'Gabarito: não informado'

  // 3. Monta prompt
  const prompt = `Escreva um comentário didático (200–350 palavras) para esta questão TEMI/AMIB.

Questão ${question.question_number}: ${question.stem}
A) ${alternatives['A'] ?? ''}
B) ${alternatives['B'] ?? ''}
C) ${alternatives['C'] ?? ''}
D) ${alternatives['D'] ?? ''}
E) ${alternatives['E'] ?? ''}
${gabaritoText}

Explique por que o gabarito está correto, justifique por que as demais alternativas estão erradas e contextualize com a prática clínica em UTI. Tom didático, direto, em português.
Retorne APENAS o texto do comentário, sem título, sem markdown.`

  // 4. Chama Claude Opus
  let commentText: string
  try {
    commentText = await complete({
      model: MODELS.opus,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1024,
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao gerar comentário: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }

  // 5. Insere em question_comments
  const { data: inserted, error: insertErr } = await supabase
    .from('question_comments')
    .insert({
      question_id,
      comment_type: 'explicacao',
      content: commentText.trim(),
      ai_model: MODELS.opus,
      created_by_ai: true,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: `Falha ao salvar comentário: ${insertErr?.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, comment_id: inserted.id })
}
