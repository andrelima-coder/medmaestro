import { createServiceClient } from '@/lib/supabase/service'
import { extractFromImages, parseJSON, MAX_IMAGES_PER_CALL, complete, MODELS } from '@/lib/ai/claude'
import { uploadFile } from '@/lib/storage/signed-urls'
import { rasterizePdf } from '@/lib/pdf/rasterize'
import { extractTextFirst } from '@/lib/extraction/text-first'

const TEXT_FIRST_MIN_CONFIDENCE = 0.7

const EXTRACTION_PROMPT = `Você é um extrator de questões de provas médicas brasileiras (TEMI/AMIB).
Analise estas páginas e extraia TODAS as questões visíveis.

Para cada questão, retorne um objeto JSON com:
- question_number: número da questão (inteiro)
- stem: enunciado completo
- alternatives: { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." }
- has_images: boolean (true se a questão contém imagens, figuras ou tabelas)
- image_type: "ecg"|"radiografia"|"tomografia"|"ultrassom"|"grafico_pv"|"grafico_guyton"|"grafico_ventilacao"|"capnografia"|"rotem"|"eeg"|"tabela"|"esquema"|"outro" (null se has_images=false)
- image_scope: "statement"|"alternative_a"|"alternative_b"|"alternative_c"|"alternative_d"|"alternative_e" (null se sem imagem)
- confidence: 1 a 5 (confiança na extração — 5 = perfeito, 1 = muito incerto)
- is_complete: boolean (true se todas as alternativas estão visíveis nestas páginas)

Retorne APENAS um JSON array. Sem markdown, sem explicação.`

type ExtractedQuestion = {
  question_number: number
  stem: string
  alternatives: Record<string, string>
  has_images: boolean
  image_type: string | null
  image_scope: string | null
  confidence: number
  is_complete: boolean
}

const IMAGE_TYPE_MAP: Record<string, string> = {
  ecg: 'ecg',
  radiografia: 'radiografia',
  tomografia: 'tomografia',
  ultrassom: 'ultrassom',
  grafico_pv: 'grafico_pv',
  grafico_guyton: 'grafico_guyton',
  grafico_ventilacao: 'grafico_ventilacao',
  capnografia: 'capnografia',
  rotem: 'rotem',
  eeg: 'eeg',
  tabela: 'tabela',
  esquema: 'esquema',
  outro: 'outro',
}

const CLASSIFY_BATCH_SIZE = 5
const COMMENTS_BATCH_SIZE = 3

type ProgressPhase =
  | 'idle'
  | 'downloading_pdf'
  | 'rasterizing'
  | 'extracting'
  | 'classifying'
  | 'commenting'
  | 'done'
  | 'error'

async function setProgress(
  exam_id: string,
  phase: ProgressPhase,
  current: number,
  total: number,
  message: string | null = null
): Promise<void> {
  const supabase = createServiceClient()
  await supabase
    .from('exams')
    .update({
      extraction_progress: {
        phase,
        current,
        total,
        message,
        updated_at: new Date().toISOString(),
      },
    })
    .eq('id', exam_id)
}

function buildTagsPrompt(tagsByDimension: Record<string, string[]>): string {
  return Object.entries(tagsByDimension)
    .map(([dim, labels]) => `${dim}: ${labels.join(' | ')}`)
    .join('\n')
}

async function classifyQuestion(questionId: string): Promise<void> {
  const supabase = createServiceClient()

  const { data: question, error: qErr } = await supabase
    .from('questions')
    .select('id, stem, alternatives')
    .eq('id', questionId)
    .single()

  if (qErr || !question) return

  const alternatives = (question.alternatives as Record<string, string> | null) ?? {}

  const { data: tags } = await supabase
    .from('tags')
    .select('id, label, dimension')
    .eq('is_active', true)

  if (!tags || tags.length === 0) return

  const tagsByDimension: Record<string, string[]> = {}
  const tagByLabel: Record<string, string> = {}

  for (const tag of tags) {
    const dim = tag.dimension as string
    if (!tagsByDimension[dim]) tagsByDimension[dim] = []
    tagsByDimension[dim].push(tag.label)
    tagByLabel[tag.label] = tag.id
  }

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
  } catch {
    return
  }

  const validTagIds = result.tags.map((label) => tagByLabel[label]).filter(Boolean)
  if (validTagIds.length === 0) return

  const rows = validTagIds.map((tag_id) => ({
    question_id: questionId,
    tag_id,
    added_by_type: 'ai_auto',
  }))

  const { error: tagInsertError } = await supabase
    .from('question_tags')
    .upsert(rows, { onConflict: 'question_id,tag_id' })

  if (tagInsertError) {
    console.error(
      `[classify ${questionId}] Insert tags falhou: ${tagInsertError.message}`
    )
  }
}

export async function generateComment(questionId: string): Promise<void> {
  const supabase = createServiceClient()

  const { data: question, error: qErr } = await supabase
    .from('questions')
    .select('id, question_number, exam_id, stem, alternatives, correct_answer')
    .eq('id', questionId)
    .single()

  if (qErr || !question) return

  const alternatives = (question.alternatives as Record<string, string> | null) ?? {}

  let correctAnswer: string = (question.correct_answer as string | null) ?? ''
  if (!correctAnswer) {
    const { data: ak } = await supabase
      .from('answer_keys')
      .select('correct_answer')
      .eq('exam_id', question.exam_id)
      .eq('question_number', question.question_number)
      .single()
    correctAnswer = (ak?.correct_answer as string | null) ?? ''
  }

  const gabaritoText = correctAnswer ? `Gabarito: ${correctAnswer}` : 'Gabarito: não informado'

  const presentLetters = (['A', 'B', 'C', 'D', 'E'] as const).filter(
    (l) => (alternatives[l] ?? '').trim().length > 0
  )
  const altsBlock = presentLetters.map((l) => `${l}) ${alternatives[l]}`).join('\n')
  const altsList = presentLetters.join(', ')

  const prompt = `Você é um professor de Medicina Intensiva escrevendo um comentário didático completo para uma questão de prova (TEMI/AMIB). Este comentário é o material de estudo principal do aluno — precisa ser denso, claro e cobrir TODAS as alternativas individualmente.

Questão ${question.question_number as number}: ${question.stem as string}
${altsBlock}
${gabaritoText}

ESTRUTURA OBRIGATÓRIA do comentário (use estes cabeçalhos exatamente, em linhas separadas, sem markdown/asterisco):

Contexto clínico
Um parágrafo (3–5 frases) situando o caso: o que o examinador está testando, qual o quadro clínico, qual o raciocínio-chave para responder. Sem rodeios.

Gabarito: ${correctAnswer || '?'}
Um parágrafo justificando por que esta é a resposta correta — fisiopatologia, achados típicos, evidência/diretriz quando aplicável.

Análise das alternativas
Para CADA UMA das alternativas presentes (${altsList}), escreva um parágrafo próprio começando com a letra e o enunciado resumido. Diga explicitamente se está CORRETA ou INCORRETA e explique o porquê com base clínica/fisiopatológica. Não pule nenhuma alternativa. Se for a correta, reforce o motivo; se for incorreta, aponte exatamente o que a torna errada (e qual seria o achado/conduta esperado naquele cenário alternativo).

Pontos-chave para a prova
3 a 5 bullets curtos (use "- " no início) com os take-aways: pegadinhas, mnemônicos, números/cutoffs, atualizações de diretriz relevantes.

Regras de estilo:
- Português técnico e direto, sem floreio.
- Use os nomes próprios das condutas/diretrizes (ex.: protocolo RUSH, sinal de McConnell, Surviving Sepsis 2021).
- NÃO use markdown (sem **, sem ##, sem listas numeradas além dos bullets dos pontos-chave).
- NÃO inclua título do comentário nem encerramento ("espero ter ajudado" etc.).
- Tamanho-alvo: 500–900 palavras.

Retorne APENAS o texto do comentário seguindo a estrutura acima.`

  let commentText: string
  try {
    commentText = await complete({
      model: MODELS.opus,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
    })
  } catch {
    return
  }

  const { error: commentInsertError } = await supabase.from('question_comments').insert({
    question_id: questionId,
    comment_type: 'explicacao',
    content: commentText.trim(),
    ai_model: MODELS.opus,
    created_by_ai: true,
  })

  if (commentInsertError) {
    console.error(
      `[comment ${questionId}] Insert falhou: ${commentInsertError.message}`
    )
  }
}

// Detecta question_numbers faltantes (gaps) e re-chama Claude com janela
// de páginas adjacentes (centradas na posição estimada). Cobre questões
// que cruzam fronteira de batch (e.g. enunciado em pg N e alternativas-imagem em pg N+1).
async function recoverMissingQuestions(
  exam_id: string,
  pages: Awaited<ReturnType<typeof rasterizePdf>>,
  specialtySlug: string,
  exam: { year: number; booklet_color: string | null }
): Promise<void> {
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('questions')
    .select('question_number')
    .eq('exam_id', exam_id)

  if (!existing || existing.length === 0) return

  const present = new Set(existing.map((q) => q.question_number as number))
  const max = Math.max(...present)
  const missing: number[] = []
  for (let i = 1; i <= max; i++) if (!present.has(i)) missing.push(i)

  if (missing.length === 0) {
    console.log(`[extract ${exam_id}] Recovery: nenhum gap detectado`)
    return
  }

  console.log(`[extract ${exam_id}] Recovery: ${missing.length} gaps: ${missing.join(',')}`)
  await setProgress(
    exam_id,
    'extracting',
    pages.length,
    pages.length,
    `Recuperando questões faltantes (${missing.join(', ')})`
  )

  // Estimativa de questões por página
  const qPerPage = max / pages.length

  // Agrupa números faltantes próximos (≤2 de distância) para evitar chamadas redundantes
  const groups: number[][] = []
  for (const q of missing) {
    const last = groups[groups.length - 1]
    if (last && q - last[last.length - 1] <= 2) last.push(q)
    else groups.push([q])
  }

  for (const group of groups) {
    const startQ = group[0]
    const endQ = group[group.length - 1]
    const centerPage = Math.round((startQ + endQ) / 2 / qPerPage)
    const startIdx = Math.max(0, centerPage - 2)
    const targetPages = pages.slice(startIdx, startIdx + MAX_IMAGES_PER_CALL)
    if (targetPages.length === 0) continue

    const pageRange = `${targetPages[0].pageNumber}–${targetPages[targetPages.length - 1].pageNumber}`
    const prompt = `Você é um extrator focado em questões médicas que cruzam fronteira de página.

Analise estas ${targetPages.length} páginas e EXTRAIA APENAS as questões com número ∈ {${group.join(', ')}}.

Estas questões podem ter enunciado em uma página e alternativas (ou imagens grandes como ECG, gráficos, tabelas) em outra. SEMPRE marque is_complete=true mesmo se faltar uma alternativa — preencha a alternativa ausente com "" (string vazia).

Quando uma alternativa for IMAGEM (ECG, gráfico, capnografia, etc.), preencha com texto descritivo curto: "ECG A — ritmo X" ou "Gráfico A — curva Y".

Para cada questão pedida, retorne JSON:
- question_number (inteiro)
- stem (enunciado completo)
- alternatives: { "A": "...", "B": "...", "C": "...", "D": "...", "E": "" }  (E pode ser "" se questão tem só 4)
- has_images: boolean
- image_type: tipo (null se has_images=false)
- image_scope: "statement"|"alternative_a"|...|"alternative_d"|"alternative_e"
- confidence: 1-5
- is_complete: true (sempre)

Retorne APENAS array JSON. Se não achar uma das questões, omita.`

    let extracted: ExtractedQuestion[]
    try {
      const raw = await extractFromImages({
        imageBase64s: targetPages.map((p) => p.jpegBase64),
        prompt,
      })
      extracted = parseJSON<ExtractedQuestion[]>(raw)
      console.log(
        `[extract ${exam_id}] Recovery group {${group.join(',')}} pgs ${pageRange}: ${extracted.length} retornadas`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[extract ${exam_id}] Recovery {${group.join(',')}} falhou: ${msg}`)
      continue
    }

    for (const q of extracted) {
      if (!group.includes(q.question_number)) continue
      const conf = Math.max(1, Math.min(5, Math.round(q.confidence)))

      const { data: inserted, error: insertError } = await supabase
        .from('questions')
        .upsert(
          {
            exam_id,
            question_number: q.question_number,
            stem: q.stem,
            alternatives: q.alternatives,
            has_images: q.has_images,
            extraction_confidence: conf,
            status: 'pending_extraction',
            extraction_method: 'recovery',
          },
          { onConflict: 'exam_id,question_number' }
        )
        .select('id')
        .single()

      if (insertError || !inserted) {
        console.error(
          `[extract ${exam_id}] Recovery insert Q${q.question_number} falhou: ${insertError?.message}`
        )
        continue
      }

      // Sobe imagens das páginas-alvo se a questão tem imagem
      if (q.has_images && q.image_scope) {
        const imageType = IMAGE_TYPE_MAP[q.image_type ?? 'outro'] ?? 'outro'
        const imageScope = q.image_scope.toLowerCase()
        for (const page of targetPages) {
          const imagePath = `${specialtySlug}/${exam.year}/${exam.booklet_color ?? 'unknown'}/q${q.question_number}/page_${page.pageNumber}.jpg`
          try {
            await uploadFile('question-images', imagePath, page.jpegBuffer, 'image/jpeg')
            await supabase.from('question_images').insert({
              question_id: inserted.id,
              image_scope: imageScope,
              image_type: imageType,
              full_page_path: imagePath,
              page_number: page.pageNumber,
            })
          } catch {
            // não bloqueia recovery por falha de imagem
          }
        }
      }
    }
  }
}

async function runClassification(exam_id: string): Promise<void> {
  const supabase = createServiceClient()

  const { data: questions } = await supabase
    .from('questions')
    .select('id')
    .eq('exam_id', exam_id)
    .in('status', ['pending_review', 'pending_extraction'])

  if (!questions || questions.length === 0) {
    await setProgress(exam_id, 'classifying', 0, 0, 'Nenhuma questão para classificar')
    return
  }

  await setProgress(exam_id, 'classifying', 0, questions.length, 'Classificando questões por IA')

  let done = 0
  for (let i = 0; i < questions.length; i += CLASSIFY_BATCH_SIZE) {
    const batch = questions.slice(i, i + CLASSIFY_BATCH_SIZE)
    await Promise.allSettled(batch.map((q) => classifyQuestion(q.id as string)))
    done += batch.length
    await setProgress(exam_id, 'classifying', done, questions.length, 'Classificando questões por IA')
  }
}

async function runComments(exam_id: string, mode: string): Promise<void> {
  if (mode === 'none') return

  const supabase = createServiceClient()

  let qQuery = supabase
    .from('questions')
    .select('id, extraction_confidence')
    .eq('exam_id', exam_id)

  if (mode === 'low_confidence') {
    qQuery = qQuery.lte('extraction_confidence', 2)
  }

  const { data: questions } = await qQuery
  if (!questions || questions.length === 0) return

  await setProgress(exam_id, 'commenting', 0, questions.length, 'Gerando comentários didáticos')

  let done = 0
  for (let i = 0; i < questions.length; i += COMMENTS_BATCH_SIZE) {
    const batch = questions.slice(i, i + COMMENTS_BATCH_SIZE)
    await Promise.allSettled(batch.map((q) => generateComment(q.id as string)))
    done += batch.length
    await setProgress(exam_id, 'commenting', done, questions.length, 'Gerando comentários didáticos')
  }
}

export async function runExtractionPipeline(exam_id: string): Promise<void> {
  const supabase = createServiceClient()

  await setProgress(exam_id, 'downloading_pdf', 0, 0, 'Baixando PDF do storage')

  const { data: exam, error: examError } = await supabase
    .from('exams')
    .select('id, source_pdf_path, year, booklet_color, specialty_id, specialties(slug)')
    .eq('id', exam_id)
    .single()

  if (examError || !exam || !exam.source_pdf_path) {
    await setProgress(exam_id, 'error', 0, 0, 'Exame não encontrado ou sem PDF')
    await supabase.from('exams').update({ status: 'error' }).eq('id', exam_id)
    return
  }

  const specialtyRaw = exam.specialties as { slug: string } | { slug: string }[] | null
  const specialtySlug = Array.isArray(specialtyRaw)
    ? (specialtyRaw[0]?.slug ?? 'unknown')
    : (specialtyRaw?.slug ?? 'unknown')

  const { data: fileData, error: dlError } = await supabase.storage
    .from('exam-pdfs')
    .download(exam.source_pdf_path as string)

  if (dlError || !fileData) {
    const msg = `Falha ao baixar PDF: ${dlError?.message ?? 'desconhecido'}`
    console.error(`[extract ${exam_id}] ${msg}`)
    await setProgress(exam_id, 'error', 0, 0, msg)
    await supabase.from('exams').update({ status: 'error' }).eq('id', exam_id)
    return
  }

  const pdfBuffer = Buffer.from(await fileData.arrayBuffer())

  await setProgress(exam_id, 'rasterizing', 0, 1, 'Convertendo PDF em imagens')

  let pages: Awaited<ReturnType<typeof rasterizePdf>>
  try {
    pages = await rasterizePdf(pdfBuffer)
  } catch (err) {
    const msg = `Falha ao rasterizar PDF: ${err instanceof Error ? err.message : String(err)}`
    console.error(`[extract ${exam_id}] ${msg}`)
    await setProgress(exam_id, 'error', 0, 0, msg)
    await supabase.from('exams').update({ status: 'error' }).eq('id', exam_id)
    return
  }

  if (pages.length === 0) {
    await setProgress(exam_id, 'error', 0, 0, 'PDF sem páginas extraíveis')
    await supabase.from('exams').update({ status: 'error' }).eq('id', exam_id)
    return
  }

  // ── Fase text-first: tenta extrair direto do PDF nativo (custo zero) ───
  await setProgress(exam_id, 'extracting', 0, pages.length, 'Tentando extração textual (sem IA)…')

  const textResult = await extractTextFirst(pdfBuffer).catch(() => null)

  // Páginas que precisam ir para o Claude Vision
  const pagesNeedingVision = new Set<number>(pages.map((p) => p.pageNumber))

  if (textResult && textResult.hasNativeText && textResult.questions.length >= 5) {
    const isAcceptedByTextFirst = (q: typeof textResult.questions[number]): boolean => {
      const altCount = Object.keys(q.alternatives).length
      return (
        q.confidence >= TEXT_FIRST_MIN_CONFIDENCE &&
        !q.has_medical_image_hint &&
        altCount >= 4 &&
        q.stem.length >= 30
      )
    }

    // Páginas que CONTÊM ao menos uma questão rejeitada pelo text-first (com hint de imagem,
    // baixa confiança, ou alts incompletas). Vision precisa rodar nelas para não perder
    // questões órfãs que dividem página com questões "simples".
    const pagesWithRejectedQuestion = new Set<number>()
    for (const q of textResult.questions) {
      if (!isAcceptedByTextFirst(q) && q.page_hint) {
        pagesWithRejectedQuestion.add(q.page_hint)
      }
    }

    let savedFromText = 0
    for (const q of textResult.questions) {
      if (!isAcceptedByTextFirst(q)) continue
      // Não salva via text-first se outra questão da mesma página precisa de Vision —
      // o Vision irá processar a página inteira e fará upsert com os dados corretos.
      if (q.page_hint && pagesWithRejectedQuestion.has(q.page_hint)) continue

      const conf5 = Math.max(1, Math.min(5, Math.round(q.confidence * 5)))
      const { error } = await supabase
        .from('questions')
        .upsert(
          {
            exam_id,
            question_number: q.question_number,
            stem: q.stem,
            alternatives: q.alternatives,
            has_images: false,
            extraction_confidence: conf5,
            status: 'pending_extraction',
            extraction_method: 'text',
          },
          { onConflict: 'exam_id,question_number' }
        )
      if (!error) {
        savedFromText++
        if (q.page_hint) pagesNeedingVision.delete(q.page_hint)
      }
    }
    console.log(
      `[extract ${exam_id}] Text-first: ${textResult.questions.length} detectadas, ${savedFromText} salvas direto (sem IA)`
    )
    await setProgress(
      exam_id,
      'extracting',
      0,
      pages.length,
      `Text-first: ${savedFromText} questões sem IA. Vision para o resto…`
    )
  }

  // Páginas que ainda precisam de Vision (com imagens médicas ou onde texto falhou)
  const visionPages = pages.filter((p) => pagesNeedingVision.has(p.pageNumber))

  await setProgress(
    exam_id,
    'extracting',
    0,
    visionPages.length || 1,
    `Extraindo com Vision (${visionPages.length}/${pages.length} páginas com imagens médicas)`
  )

  let hasErrors = false
  let lastErrorMessage: string | null = null

  for (let batchStart = 0; batchStart < visionPages.length; batchStart += MAX_IMAGES_PER_CALL) {
    const batch = visionPages.slice(batchStart, batchStart + MAX_IMAGES_PER_CALL)
    const imageBase64s = batch.map((p) => p.jpegBase64)
    const batchLabel = `páginas ${batch[0]?.pageNumber ?? '?'}–${batch[batch.length - 1]?.pageNumber ?? '?'}`

    let extracted: ExtractedQuestion[]
    let rawClaude = ''
    try {
      rawClaude = await extractFromImages({ imageBase64s, prompt: EXTRACTION_PROMPT })
      extracted = parseJSON<ExtractedQuestion[]>(rawClaude)
    } catch (err) {
      hasErrors = true
      const msg = err instanceof Error ? err.message : String(err)
      lastErrorMessage = `Falha em ${batchLabel}: ${msg}`
      const preview = rawClaude.slice(0, 300).replace(/\s+/g, ' ')
      console.error(`[extract ${exam_id}] ${lastErrorMessage} | raw_preview="${preview}"`)
      await setProgress(
        exam_id,
        'extracting',
        Math.min(batchStart + batch.length, visionPages.length),
        visionPages.length || 1,
        lastErrorMessage
      )
      continue
    }

    const completeCount = extracted.filter((q) => q.is_complete).length
    console.log(
      `[extract ${exam_id}] ${batchLabel}: ${extracted.length} questões retornadas, ${completeCount} completas`
    )
    if (extracted.length === 0) {
      lastErrorMessage = `Claude retornou 0 questões em ${batchLabel}`
      hasErrors = true
    }

    for (const q of extracted) {
      if (!q.is_complete) continue

      const extractionConfidence = Math.max(1, Math.min(5, Math.round(q.confidence)))

      const { data: inserted, error: insertError } = await supabase
        .from('questions')
        .upsert(
          {
            exam_id,
            question_number: q.question_number,
            stem: q.stem,
            alternatives: q.alternatives,
            has_images: q.has_images,
            extraction_confidence: extractionConfidence,
            status: 'pending_extraction',
            extraction_method: 'vision',
          },
          { onConflict: 'exam_id,question_number' }
        )
        .select('id')
        .single()

      if (insertError || !inserted) {
        hasErrors = true
        lastErrorMessage = `Insert falhou Q${q.question_number}: ${insertError?.message ?? 'no row'}`
        console.error(`[extract ${exam_id}] ${lastErrorMessage}`)
        continue
      }

      if (q.has_images && q.image_scope) {
        const imageType = IMAGE_TYPE_MAP[q.image_type ?? 'outro'] ?? 'outro'
        const imageScope = q.image_scope.toLowerCase()

        for (const page of batch) {
          const imagePath = `${specialtySlug}/${exam.year}/${exam.booklet_color ?? 'unknown'}/q${q.question_number}/page_${page.pageNumber}.jpg`

          try {
            await uploadFile('question-images', imagePath, page.jpegBuffer, 'image/jpeg')
          } catch {
            hasErrors = true
            continue
          }

          const { error: imgInsertError } = await supabase.from('question_images').insert({
            question_id: inserted.id,
            image_scope: imageScope,
            image_type: imageType,
            full_page_path: imagePath,
            page_number: page.pageNumber,
          })

          if (imgInsertError) hasErrors = true
        }
      }
    }

    const pagesProcessed = Math.min(batchStart + batch.length, visionPages.length)
    await setProgress(
      exam_id,
      'extracting',
      pagesProcessed,
      visionPages.length || 1,
      `Vision: ${pagesProcessed}/${visionPages.length} páginas (${pages.length - visionPages.length} já extraídas via texto)`
    )
  }

  // Pós-loop: tenta recuperar questões que cruzaram fronteira de batch
  try {
    await recoverMissingQuestions(
      exam_id,
      pages,
      specialtySlug,
      { year: exam.year as number, booklet_color: exam.booklet_color as string | null }
    )
  } catch (err) {
    console.error(
      `[extract ${exam_id}] Recovery falhou: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  try {
    await supabase.rpc('sync_correct_answers', { p_exam_id: exam_id })
  } catch {
    // gabarito pode não ter sido enviado ainda
  }

  await supabase
    .from('questions')
    .update({ status: 'pending_review' })
    .eq('exam_id', exam_id)
    .eq('status', 'pending_extraction')

  await supabase.from('exams').update({ status: 'classifying' }).eq('id', exam_id)
  await runClassification(exam_id)

  const { data: examPrefs } = await supabase
    .from('exams')
    .select('auto_comments')
    .eq('id', exam_id)
    .single()
  await runComments(exam_id, (examPrefs?.auto_comments as string | null) ?? 'none')

  const { count: finalCount } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .eq('exam_id', exam_id)

  const errorMsg = hasErrors
    ? lastErrorMessage
      ? `Concluído com erros parciais — último: ${lastErrorMessage} (${finalCount ?? 0} questões salvas)`
      : `Concluído com erros parciais (${finalCount ?? 0} questões salvas)`
    : `Pipeline concluído — ${finalCount ?? 0} questões`

  await setProgress(exam_id, hasErrors ? 'error' : 'done', 1, 1, errorMsg)

  await supabase
    .from('exams')
    .update({ status: hasErrors ? 'error' : 'done' })
    .eq('id', exam_id)
}
