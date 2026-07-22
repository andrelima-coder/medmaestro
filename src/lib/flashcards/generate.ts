import { createServiceClient } from '@/lib/supabase/service'
import { complete, parseJsonLoose, MODELS, recordUsage } from '@/lib/ai/claude'

export type CardType = 'qa' | 'cloze'
export type GenerateOptions = {
  count: number
  types: CardType[]
  inheritTags: boolean
}

type GeneratedCard = {
  card_type: CardType
  front: string
  back: string
  difficulty: number
}

type GenerationResponse = {
  habilidade?: string
  cards: GeneratedCard[]
}

// Habilidade avaliada == dimensão `tipo_questao` (decisão de produto).
const HABILIDADE_SLUGS = [
  'conduta',
  'diagnostico',
  'fisiopatologia',
  'farmacologia',
  'interpretacao',
] as const

const MAX_CARDS_PER_QUESTION = 5
// Dimensões herdadas pelos flashcards: temas (módulo + tópico do edital) e
// habilidade (tipo_questao).
const INHERIT_DIMENSIONS = ['modulo', 'topico_edital', 'tipo_questao'] as const

type QuestionTag = { tag_id: string; slug: string; dimension: string }

async function loadQuestionTags(
  supabase: ReturnType<typeof createServiceClient>,
  questionId: string
): Promise<QuestionTag[]> {
  const { data } = await supabase
    .from('question_tags')
    .select('tag_id, tags!inner(slug, dimension)')
    .eq('question_id', questionId)

  return (data ?? [])
    .map((row) => {
      const tag = row.tags as unknown as { slug: string; dimension: string } | null
      return tag
        ? { tag_id: row.tag_id as string, slug: tag.slug, dimension: tag.dimension }
        : null
    })
    .filter((t): t is QuestionTag => t !== null)
    .filter((t) => INHERIT_DIMENSIONS.includes(t.dimension as (typeof INHERIT_DIMENSIONS)[number]))
}

function buildSystemPrompt(opts: GenerateOptions): string {
  const typesLabel = opts.types.includes('cloze')
    ? opts.types.length === 2
      ? '"qa" (pergunta/resposta direta) E "cloze" (frase com {{c1::trecho}})'
      : '"cloze" (frase com {{c1::trecho}})'
    : '"qa" (pergunta/resposta direta)'

  return `Você é um especialista em medicina intensiva criando flashcards para revisão espaçada de residentes médicos brasileiros (preparação para o TEMI/AMIB).

A partir da questão abaixo — usando o ENUNCIADO, as ALTERNATIVAS marcadas como CORRETA/INCORRETA e o COMENTÁRIO didático (quando houver) — gere ${opts.count} flashcard${opts.count > 1 ? 's' : ''} que ensinem os CONCEITOS CLÍNICOS subjacentes. NÃO refaça o caso clínico.

ANTES de gerar, identifique a HABILIDADE avaliada pela questão, escolhendo UM destes valores:
- "conduta" (decisão terapêutica / manejo)
- "diagnostico" (raciocínio diagnóstico)
- "fisiopatologia" (mecanismo de doença)
- "farmacologia" (droga, dose, alvo, interação)
- "interpretacao" (leitura de exame/imagem/gráfico)

REGRAS DOS CARDS:
- Cards CURTOS: front ≤ 150 chars, back ≤ 350 chars
- Foco em FATOS testáveis: mecanismo, dose, alvo, contra-indicação, valor de referência
- Aproveite as alternativas INCORRETAS para ensinar o porquê de estarem erradas quando for didático
- NÃO dependa do enunciado original — o card deve fazer sentido sozinho
- O "back" deve trazer a resposta + 1 frase curta de EXPLICAÇÃO clínica (justificativa)
- Tipos permitidos: ${typesLabel}
- Cloze: use {{c1::trecho}} (Anki) marcando 1 fato chave por card
- difficulty: 1=Muito fácil ··· 3=Médio ··· 5=Muito difícil

Retorne APENAS um objeto JSON (sem markdown, sem comentários) no formato:
{
  "habilidade": "conduta" | "diagnostico" | "fisiopatologia" | "farmacologia" | "interpretacao",
  "cards": [
    { "card_type": "qa" | "cloze", "front": "...", "back": "resposta + justificativa clínica curta", "difficulty": 1-5 }
  ]
}
O array "cards" deve ter exatamente ${opts.count} item${opts.count > 1 ? 's' : ''}.`
}

function buildUserMessage(q: {
  question_number: number | null
  stem: string | null
  alternatives: Record<string, string>
  correct_answer: string | null
  comment: string | null
}): string {
  const correct = (q.correct_answer ?? '').trim().toUpperCase()
  const altLines = (['A', 'B', 'C', 'D', 'E'] as const)
    .filter((l) => (q.alternatives[l] ?? '').trim().length > 0)
    .map((l) => {
      const mark = correct === l ? 'CORRETA' : correct ? 'INCORRETA' : '?'
      return `${l}) [${mark}] ${q.alternatives[l]}`
    })

  const parts = [
    `Questão ${q.question_number ?? ''}: ${q.stem ?? ''}`,
    altLines.join('\n'),
    `Gabarito: ${correct || 'não informado'}`,
  ]
  if (q.comment && q.comment.trim()) {
    parts.push(`\nComentário didático da questão (use como base do raciocínio):\n${q.comment.trim()}`)
  }
  return parts.join('\n')
}

async function loadQuestionComment(
  supabase: ReturnType<typeof createServiceClient>,
  questionId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('question_comments')
    .select('comment_type, content')
    .eq('question_id', questionId)
    .order('created_at', { ascending: true })

  if (!data || data.length === 0) return null
  // Prioriza a explicação; concatena os demais tipos como contexto.
  const ordered = [...data].sort((a, b) =>
    a.comment_type === 'explicacao' ? -1 : b.comment_type === 'explicacao' ? 1 : 0
  )
  return ordered
    .map((c) => (c.content as string | null) ?? '')
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 6000)
}

export async function generateFlashcardsForQuestion(
  questionId: string,
  options: GenerateOptions
): Promise<{ ok: boolean; created: number; error?: string }> {
  const supabase = createServiceClient()

  const count = Math.max(1, Math.min(MAX_CARDS_PER_QUESTION, options.count))
  const opts: GenerateOptions = { ...options, count }

  const { data: q, error: qErr } = await supabase
    .from('questions')
    .select('id, exam_id, stem, alternatives, correct_answer, question_number')
    .eq('id', questionId)
    .single()

  if (qErr || !q) {
    return { ok: false, created: 0, error: 'Questão não encontrada' }
  }

  const alternatives = (q.alternatives as Record<string, string> | null) ?? {}
  const comment = await loadQuestionComment(supabase, questionId)
  const questionTags = await loadQuestionTags(supabase, questionId)

  const userMsg = buildUserMessage({
    question_number: q.question_number as number | null,
    stem: q.stem as string | null,
    alternatives,
    correct_answer: q.correct_answer as string | null,
    comment,
  })

  let response: GenerationResponse
  try {
    const raw = await complete({
      model: MODELS.sonnet,
      system: buildSystemPrompt(opts),
      cacheSystem: true,
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: 2048,
    })
    await recordUsage(raw.model, raw.usage, {
      operation: 'flashcards_generate',
      question_id: questionId,
      exam_id: q.exam_id as string,
    })
    response = parseJsonLoose<GenerationResponse>(raw.text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[flashcards ${questionId}] geração falhou: ${msg}`)
    return { ok: false, created: 0, error: msg }
  }

  const cards = Array.isArray(response?.cards) ? response.cards : []
  if (cards.length === 0) {
    return { ok: false, created: 0, error: 'Modelo retornou 0 cards' }
  }

  const filtered = cards.filter((c) => opts.types.includes(c.card_type)).slice(0, count)
  if (filtered.length === 0) {
    return { ok: false, created: 0, error: 'Nenhum card do tipo permitido' }
  }

  const rows = filtered.map((c) => ({
    source_question_id: questionId,
    card_type: c.card_type,
    front: (c.front ?? '').slice(0, 500),
    back: (c.back ?? '').slice(0, 1500),
    difficulty: Math.max(1, Math.min(5, Math.round(c.difficulty ?? 3))),
    ai_model: MODELS.sonnet,
    created_by_ai: true,
    // AUDITORIA 2026-07: cards de IA nascem NÃO aprovados — passam pelo gate
    // humano em /revisao-flashcards antes de aparecer no export padrão (Anki).
    // Antes nasciam approved:true e a tela de revisão nunca recebia nada.
    approved: false,
  }))

  const { data: inserted, error: insErr } = await supabase
    .from('flashcards')
    .insert(rows)
    .select('id')

  if (insErr || !inserted) {
    console.error(`[flashcards ${questionId}] insert falhou: ${insErr?.message}`)
    return { ok: false, created: 0, error: insErr?.message }
  }

  if (opts.inheritTags && inserted.length > 0) {
    await attachFlashcardTags(supabase, inserted.map((c) => c.id as string), questionTags, response.habilidade)
  }

  return { ok: true, created: inserted.length }
}

/**
 * Anexa tags aos flashcards: herda as tags da questão (módulo + tópico edital +
 * tipo_questao). Se a questão não tiver `tipo_questao`, resolve a habilidade
 * sugerida pela IA para a tag correspondente do conjunto fixo de 5.
 */
async function attachFlashcardTags(
  supabase: ReturnType<typeof createServiceClient>,
  flashcardIds: string[],
  questionTags: QuestionTag[],
  aiHabilidade: string | undefined
): Promise<void> {
  const tagIds = new Set(questionTags.map((t) => t.tag_id))

  const hasHabilidade = questionTags.some((t) => t.dimension === 'tipo_questao')
  if (!hasHabilidade) {
    const slug = (aiHabilidade ?? '').trim().toLowerCase()
    if ((HABILIDADE_SLUGS as readonly string[]).includes(slug)) {
      const { data: tag } = await supabase
        .from('tags')
        .select('id')
        .eq('dimension', 'tipo_questao')
        .eq('slug', slug)
        .maybeSingle()
      if (tag?.id) tagIds.add(tag.id as string)
    }
  }

  if (tagIds.size === 0) return

  const tagRows = flashcardIds.flatMap((fid) =>
    [...tagIds].map((tid) => ({
      flashcard_id: fid,
      tag_id: tid,
      added_by_type: 'inherited',
    }))
  )
  await supabase.from('flashcard_tags').upsert(tagRows, {
    onConflict: 'flashcard_id,tag_id',
  })
}

/**
 * Triagem barata (Haiku): a partir do enunciado + 1ª linha do comentário,
 * sugere quantos flashcards gerar por questão (1–5). Usado para pré-preencher
 * o modal de geração; o usuário pode ajustar.
 */
export async function suggestFlashcardCounts(
  questionIds: string[]
): Promise<Record<string, number>> {
  const ids = [...new Set(questionIds)].slice(0, 100)
  const fallback: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 2]))
  if (ids.length === 0) return fallback

  const supabase = createServiceClient()
  const { data: qs } = await supabase
    .from('questions')
    .select('id, question_number, stem')
    .in('id', ids)

  if (!qs || qs.length === 0) return fallback

  const { data: comments } = await supabase
    .from('question_comments')
    .select('question_id, content')
    .in('question_id', ids)
  const firstLine = new Map<string, string>()
  for (const c of comments ?? []) {
    const qid = c.question_id as string
    if (!firstLine.has(qid)) {
      firstLine.set(qid, ((c.content as string | null) ?? '').slice(0, 300))
    }
  }

  const list = qs
    .map((q) => {
      const stem = ((q.stem as string | null) ?? '').slice(0, 400)
      const cm = firstLine.get(q.id as string) ?? ''
      return `ID ${q.id}\nQ${q.question_number}: ${stem}${cm ? `\nComentário: ${cm}` : ''}`
    })
    .join('\n---\n')

  const system = `Você decide quantos flashcards de revisão espaçada vale a pena gerar para cada questão de medicina intensiva.
Critério: questões densas, com várias alternativas didáticas, valores/cutoffs ou comentário rico → mais cards (até 5). Questões simples/diretas → 1 a 2.
Responda SOMENTE com um JSON array, sem markdown, sem justificativa, sem nenhum texto antes ou depois, no formato:
[{ "id": "<id>", "count": 1-5 }]
Inclua exatamente um item por questão recebida.`

  try {
    const raw = await complete({
      model: MODELS.haiku,
      system,
      messages: [{ role: 'user', content: list }],
      maxTokens: 1024,
    })
    await recordUsage(raw.model, raw.usage, { operation: 'flashcards_suggest' })
    const parsed = parseJsonLoose<Array<{ id: string; count: number }>>(raw.text)
    const result = { ...fallback }
    for (const item of parsed) {
      if (item && typeof item.id === 'string' && ids.includes(item.id)) {
        result[item.id] = Math.max(1, Math.min(MAX_CARDS_PER_QUESTION, Math.round(item.count ?? 2)))
      }
    }
    return result
  } catch (err) {
    console.error('[flashcards suggest] falhou:', err instanceof Error ? err.message : err)
    return fallback
  }
}
