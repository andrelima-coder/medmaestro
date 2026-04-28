import { createServiceClient } from '@/lib/supabase/service'
import { extractFromImages, parseJSON, MAX_IMAGES_PER_CALL, complete, MODELS } from '@/lib/ai/claude'
import { uploadFile } from '@/lib/storage/signed-urls'
import { rasterizePdf } from '@/lib/pdf/rasterize'

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

  const prompt = `Escreva um comentário didático (200–350 palavras) para esta questão TEMI/AMIB.

Questão ${question.question_number as number}: ${question.stem as string}
A) ${alternatives['A'] ?? ''}
B) ${alternatives['B'] ?? ''}
C) ${alternatives['C'] ?? ''}
D) ${alternatives['D'] ?? ''}
E) ${alternatives['E'] ?? ''}
${gabaritoText}

Explique por que o gabarito está correto, justifique por que as demais alternativas estão erradas e contextualize com a prática clínica em UTI. Tom didático, direto, em português.
Retorne APENAS o texto do comentário, sem título, sem markdown.`

  let commentText: string
  try {
    commentText = await complete({
      model: MODELS.opus,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1024,
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

  await setProgress(exam_id, 'extracting', 0, pages.length, `Extraindo questões (${pages.length} páginas)`)

  let hasErrors = false
  let lastErrorMessage: string | null = null

  for (let batchStart = 0; batchStart < pages.length; batchStart += MAX_IMAGES_PER_CALL) {
    const batch = pages.slice(batchStart, batchStart + MAX_IMAGES_PER_CALL)
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
        Math.min(batchStart + batch.length, pages.length),
        pages.length,
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

    const pagesProcessed = Math.min(batchStart + batch.length, pages.length)
    await setProgress(
      exam_id,
      'extracting',
      pagesProcessed,
      pages.length,
      `Extraindo questões (${pagesProcessed}/${pages.length} páginas)`
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
