import { createServiceClient } from '@/lib/supabase/service'
import { complete, parseJSON, MODELS, type ClaudeModel } from '@/lib/ai/claude'

export type DifficultyDelta = 0 | 1 | 2

export type GenerateVariationsOptions = {
  count: number
  difficultyDelta: DifficultyDelta
  inheritTags: boolean
  model?: 'sonnet' | 'opus'
}

type GeneratedVariation = {
  stem: string
  alternatives: Record<string, string>
  correct_answer: string
  rationale?: string
}

const MAX_VARIATIONS_PER_QUESTION = 10

const DIFFICULTY_INSTRUCTION: Record<DifficultyDelta, string> = {
  0: 'Mantenha a MESMA dificuldade da questão original (mesmo raciocínio, mesmas pegadinhas, mesma profundidade conceitual).',
  1: 'AUMENTE 1 NÍVEL de dificuldade: adicione um distrator mais sofisticado e exija um passo adicional de raciocínio clínico.',
  2: 'AUMENTE 2 NÍVEIS de dificuldade: cenário mais ambíguo, alternativas próximas entre si, exige integração de pelo menos 2 conceitos clínicos diferentes.',
}

function buildPrompt(opts: GenerateVariationsOptions): string {
  return `Você é um elaborador de questões médicas TEMI/AMIB para residentes de medicina intensiva.

A partir da questão original abaixo, gere ${opts.count} variação${opts.count > 1 ? 'ões' : ''} que:
- Cobre(m) a MESMA habilidade/competência clínica (mesmo conceito-alvo, mesma área)
- Mantém(êm) a estrutura: enunciado + 5 alternativas A-E com gabarito único
- ${DIFFICULTY_INSTRUCTION[opts.difficultyDelta]}
- Apresenta(m) cenário clínico DIFERENTE (paciente, idade, comorbidades, sinais, achados de exame)
- Mantém(êm) o mesmo conceito-alvo da questão original

Para cada variação, retorne JSON:
{
  "stem": "<enunciado completo (cenário + pergunta)>",
  "alternatives": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." },
  "correct_answer": "A" | "B" | "C" | "D" | "E",
  "rationale": "<1 frase curta explicando por que a alternativa correta está certa>"
}

Retorne APENAS um JSON array com ${opts.count} variação${opts.count > 1 ? 'ões' : ''}, sem markdown, sem comentários adicionais.`
}

export async function generateVariationsForQuestion(
  questionId: string,
  options: GenerateVariationsOptions
): Promise<{ ok: boolean; created: number; error?: string }> {
  const supabase = createServiceClient()

  const count = Math.max(1, Math.min(MAX_VARIATIONS_PER_QUESTION, options.count))
  const opts: GenerateVariationsOptions = { ...options, count }
  const model: ClaudeModel = MODELS[options.model ?? 'sonnet']

  const { data: q, error: qErr } = await supabase
    .from('questions')
    .select('id, stem, alternatives, correct_answer, question_number')
    .eq('id', questionId)
    .single()

  if (qErr || !q) {
    return { ok: false, created: 0, error: 'Questão não encontrada' }
  }

  const alternatives = (q.alternatives as Record<string, string> | null) ?? {}
  const userMsg = `QUESTÃO ORIGINAL ${q.question_number}:
${q.stem}

A) ${alternatives['A'] ?? ''}
B) ${alternatives['B'] ?? ''}
C) ${alternatives['C'] ?? ''}
D) ${alternatives['D'] ?? ''}
E) ${alternatives['E'] ?? ''}

GABARITO ORIGINAL: ${q.correct_answer ?? 'não informado'}`

  let variations: GeneratedVariation[]
  try {
    const raw = await complete({
      model,
      system: buildPrompt(opts),
      cacheSystem: true,
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: 4096,
    })
    variations = parseJSON<GeneratedVariation[]>(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[variations ${questionId}] geração falhou: ${msg}`)
    return { ok: false, created: 0, error: msg }
  }

  if (!Array.isArray(variations) || variations.length === 0) {
    return { ok: false, created: 0, error: 'Modelo retornou 0 variações' }
  }

  const valid = variations
    .filter(
      (v) =>
        typeof v.stem === 'string' &&
        v.stem.length > 30 &&
        v.alternatives &&
        Object.keys(v.alternatives).length >= 4 &&
        typeof v.correct_answer === 'string' &&
        /^[A-E]$/.test(v.correct_answer.toUpperCase())
    )
    .slice(0, count)

  if (valid.length === 0) {
    return { ok: false, created: 0, error: 'Nenhuma variação válida retornada' }
  }

  const rows = valid.map((v) => ({
    source_question_id: questionId,
    stem: v.stem.slice(0, 4000),
    alternatives: v.alternatives,
    correct_answer: v.correct_answer.toUpperCase(),
    rationale: v.rationale?.slice(0, 800) ?? null,
    difficulty_delta: opts.difficultyDelta,
    ai_model: model,
    approved: false,
  }))

  const { data: inserted, error: insErr } = await supabase
    .from('question_variations')
    .insert(rows)
    .select('id')

  if (insErr || !inserted) {
    console.error(`[variations ${questionId}] insert falhou: ${insErr?.message}`)
    return { ok: false, created: 0, error: insErr?.message }
  }

  if (opts.inheritTags && inserted.length > 0) {
    const { data: qtags } = await supabase
      .from('question_tags')
      .select('tag_id')
      .eq('question_id', questionId)

    if (qtags && qtags.length > 0) {
      const tagRows = inserted.flatMap((v) =>
        qtags.map((qt) => ({
          variation_id: v.id as string,
          tag_id: qt.tag_id as string,
          added_by_type: 'inherited',
        }))
      )
      await supabase
        .from('question_variation_tags')
        .upsert(tagRows, { onConflict: 'variation_id,tag_id' })
    }
  }

  return { ok: true, created: inserted.length }
}

// Promove uma variação aprovada para questions (cria nova questão "filha" no banco principal)
export async function promoteVariationToQuestion(
  variationId: string
): Promise<{ ok: boolean; questionId?: string; error?: string }> {
  const supabase = createServiceClient()

  const { data: v, error: vErr } = await supabase
    .from('question_variations')
    .select(
      'id, source_question_id, stem, alternatives, correct_answer, promoted_question_id, questions!source_question_id(exam_id)'
    )
    .eq('id', variationId)
    .single()

  if (vErr || !v) return { ok: false, error: 'Variação não encontrada' }
  if (v.promoted_question_id)
    return { ok: false, error: 'Variação já promovida' }

  const sourceExam = v.questions as unknown as { exam_id: string } | null
  if (!sourceExam?.exam_id)
    return { ok: false, error: 'Exame da questão original não encontrado' }

  // Pega próximo número de questão livre: max + 1 a partir de 1000 para não conflitar com extração
  const { data: maxRow } = await supabase
    .from('questions')
    .select('question_number')
    .eq('exam_id', sourceExam.exam_id)
    .order('question_number', { ascending: false })
    .limit(1)
    .single()
  const nextNumber = Math.max(1000, ((maxRow?.question_number as number) ?? 999) + 1)

  const { data: newQ, error: insErr } = await supabase
    .from('questions')
    .insert({
      exam_id: sourceExam.exam_id,
      question_number: nextNumber,
      stem: v.stem,
      alternatives: v.alternatives,
      correct_answer: v.correct_answer,
      has_images: false,
      extraction_confidence: 5,
      status: 'pending_review',
      extraction_method: 'vision',
    })
    .select('id')
    .single()

  if (insErr || !newQ) return { ok: false, error: insErr?.message }

  // Herda tags
  const { data: vtags } = await supabase
    .from('question_variation_tags')
    .select('tag_id')
    .eq('variation_id', variationId)

  if (vtags && vtags.length > 0) {
    await supabase.from('question_tags').insert(
      vtags.map((vt) => ({
        question_id: newQ.id as string,
        tag_id: vt.tag_id as string,
        added_by_type: 'ai_auto',
      }))
    )
  }

  await supabase
    .from('question_variations')
    .update({
      promoted_question_id: newQ.id as string,
      updated_at: new Date().toISOString(),
    })
    .eq('id', variationId)

  return { ok: true, questionId: newQ.id as string }
}
