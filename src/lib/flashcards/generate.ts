import { createServiceClient } from '@/lib/supabase/service'
import { complete, parseJSON, MODELS } from '@/lib/ai/claude'

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

const MAX_CARDS_PER_QUESTION = 5

function buildPrompt(opts: GenerateOptions): string {
  const typesLabel = opts.types.includes('cloze')
    ? opts.types.length === 2
      ? '"qa" (pergunta/resposta direta) E "cloze" (frase com {{c1::trecho}})'
      : '"cloze" (frase com {{c1::trecho}})'
    : '"qa" (pergunta/resposta direta)'

  return `Você é um especialista em medicina intensiva criando flashcards para revisão espaçada de residentes médicos brasileiros.

A partir da questão TEMI/AMIB abaixo, gere ${opts.count} flashcard${opts.count > 1 ? 's' : ''} que ensinem os CONCEITOS CLÍNICOS subjacentes — NÃO refaça o caso clínico.

REGRAS:
- Cards CURTOS: front ≤ 150 chars, back ≤ 350 chars
- Foco em FATOS testáveis: mecanismo, dose, alvo, contra-indicação, valor de referência
- NÃO dependa do enunciado original — o card deve fazer sentido sozinho
- Tipos permitidos: ${typesLabel}
- Cloze: use {{c1::trecho}} (Anki) marcando 1 fato chave por card
- difficulty: 1=Muito fácil ··· 3=Médio ··· 5=Muito difícil

Para cada card, retorne JSON:
{
  "card_type": "qa" | "cloze",
  "front": "<pergunta direta OU frase com {{c1::trecho}}>",
  "back": "<resposta + 1 frase de justificativa clínica curta>",
  "difficulty": 1-5
}

Retorne APENAS um JSON array com ${opts.count} card${opts.count > 1 ? 's' : ''}, sem markdown, sem comentários.`
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
    .select('id, stem, alternatives, correct_answer, question_number')
    .eq('id', questionId)
    .single()

  if (qErr || !q) {
    return { ok: false, created: 0, error: 'Questão não encontrada' }
  }

  const alternatives = (q.alternatives as Record<string, string> | null) ?? {}
  const userMsg = `Questão ${q.question_number}: ${q.stem}
A) ${alternatives['A'] ?? ''}
B) ${alternatives['B'] ?? ''}
C) ${alternatives['C'] ?? ''}
D) ${alternatives['D'] ?? ''}
E) ${alternatives['E'] ?? ''}
Gabarito: ${q.correct_answer ?? 'não informado'}`

  let cards: GeneratedCard[]
  try {
    const raw = await complete({
      model: MODELS.sonnet,
      system: buildPrompt(opts),
      cacheSystem: true,
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: 2048,
    })
    cards = parseJSON<GeneratedCard[]>(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[flashcards ${questionId}] geração falhou: ${msg}`)
    return { ok: false, created: 0, error: msg }
  }

  if (!Array.isArray(cards) || cards.length === 0) {
    return { ok: false, created: 0, error: 'Modelo retornou 0 cards' }
  }

  // Filtra para os tipos permitidos
  const filtered = cards.filter((c) => opts.types.includes(c.card_type)).slice(0, count)
  if (filtered.length === 0) {
    return { ok: false, created: 0, error: 'Nenhum card do tipo permitido' }
  }

  const rows = filtered.map((c) => ({
    source_question_id: questionId,
    card_type: c.card_type,
    front: c.front.slice(0, 500),
    back: c.back.slice(0, 1500),
    difficulty: Math.max(1, Math.min(5, Math.round(c.difficulty ?? 3))),
    ai_model: MODELS.sonnet,
    created_by_ai: true,
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

  // Herda tags da questão original
  if (opts.inheritTags && inserted.length > 0) {
    const { data: qtags } = await supabase
      .from('question_tags')
      .select('tag_id')
      .eq('question_id', questionId)

    if (qtags && qtags.length > 0) {
      const tagRows = inserted.flatMap((card) =>
        qtags.map((qt) => ({
          flashcard_id: card.id as string,
          tag_id: qt.tag_id as string,
          added_by_type: 'inherited',
        }))
      )
      await supabase.from('flashcard_tags').upsert(tagRows, {
        onConflict: 'flashcard_id,tag_id',
      })
    }
  }

  return { ok: true, created: inserted.length }
}
