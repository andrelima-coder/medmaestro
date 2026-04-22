import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { complete, parseJSON, MODELS } from '@/lib/ai/claude'

function checkAuth(request: Request): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

function buildTagsPrompt(tagsByDimension: Record<string, string[]>): string {
  return Object.entries(tagsByDimension)
    .map(([dim, labels]) => `${dim}: ${labels.join(' | ')}`)
    .join('\n')
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
    .select('id, stem, alternatives')
    .eq('id', question_id)
    .single()

  if (qErr || !question) {
    return NextResponse.json({ error: 'Questão não encontrada' }, { status: 404 })
  }

  const alternatives = (question.alternatives as Record<string, string> | null) ?? {}

  // 2. Busca tags ativas — dimension está diretamente na tabela
  const { data: tags } = await supabase
    .from('tags')
    .select('id, label, dimension')
    .eq('is_active', true)

  if (!tags || tags.length === 0) {
    return NextResponse.json({ ok: true, tags_applied: 0 })
  }

  // 3. Agrupa por dimensão
  const tagsByDimension: Record<string, string[]> = {}
  const tagByLabel: Record<string, string> = {} // label → id

  for (const tag of tags) {
    const dim = tag.dimension as string
    if (!tagsByDimension[dim]) tagsByDimension[dim] = []
    tagsByDimension[dim].push(tag.label)
    tagByLabel[tag.label] = tag.id
  }

  // 4. Monta prompt
  const systemPrompt = `Você é um classificador de questões médicas TEMI/AMIB.
Analise a questão e aplique as tags mais relevantes de cada dimensão.
No máximo 1 tag por dimensão. Retorne APENAS JSON: { "tags": ["label1", "label2"] }

Dimensões e tags disponíveis:
${buildTagsPrompt(tagsByDimension)}`

  const questionText = `Questão: ${question.stem}
A) ${alternatives['A'] ?? ''}
B) ${alternatives['B'] ?? ''}
C) ${alternatives['C'] ?? ''}
D) ${alternatives['D'] ?? ''}
E) ${alternatives['E'] ?? ''}`

  // 5. Chama Claude Sonnet
  let result: { tags: string[] }
  try {
    const raw = await complete({
      model: MODELS.sonnet,
      system: systemPrompt,
      cacheSystem: true,
      messages: [{ role: 'user', content: questionText }],
      maxTokens: 512,
    })
    result = parseJSON<{ tags: string[] }>(raw)
  } catch (err) {
    return NextResponse.json(
      { error: `Falha na classificação: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }

  // 6. Mapeia labels → IDs e insere em question_tags
  const validTagIds = result.tags
    .map((label) => tagByLabel[label])
    .filter(Boolean)

  if (validTagIds.length === 0) {
    return NextResponse.json({ ok: true, tags_applied: 0 })
  }

  const rows = validTagIds.map((tag_id) => ({
    question_id,
    tag_id,
    added_by_type: 'ai',
  }))

  const { error: upsertErr } = await supabase
    .from('question_tags')
    .upsert(rows, { onConflict: 'question_id,tag_id' })

  if (upsertErr) {
    return NextResponse.json(
      { error: `Falha ao salvar tags: ${upsertErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, tags_applied: validTagIds.length })
}
