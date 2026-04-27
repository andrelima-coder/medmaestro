import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { extractFromImages, parseJSON, MAX_IMAGES_PER_CALL } from '@/lib/ai/claude'
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

function checkAuth(request: Request): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

// Classifica todas as questões de um exame chamando /api/classify em lotes.
// Falhas individuais são toleradas — o exame não fica em erro por conta delas.
async function runClassification(exam_id: string): Promise<void> {
  const supabase = createServiceClient()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const workerSecret = process.env.WORKER_SECRET ?? ''

  const { data: questions } = await supabase
    .from('questions')
    .select('id')
    .eq('exam_id', exam_id)
    .in('status', ['pending_review', 'pending_extraction'])

  if (!questions || questions.length === 0) return

  for (let i = 0; i < questions.length; i += CLASSIFY_BATCH_SIZE) {
    const batch = questions.slice(i, i + CLASSIFY_BATCH_SIZE)
    await Promise.allSettled(
      batch.map((q) =>
        fetch(`${baseUrl}/api/classify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(workerSecret && { Authorization: `Bearer ${workerSecret}` }),
          },
          body: JSON.stringify({ question_id: q.id }),
        }).catch(() => null)
      )
    )
  }
}

async function runExtraction(exam_id: string) {
  const supabase = createServiceClient()

  const { data: exam, error: examError } = await supabase
    .from('exams')
    .select('id, source_pdf_path, year, booklet_color, specialty_id, specialties(slug)')
    .eq('id', exam_id)
    .single()

  if (examError || !exam || !exam.source_pdf_path) {
    await supabase.from('exams').update({ status: 'error' }).eq('id', exam_id)
    return
  }

  const specialtyRaw = exam.specialties as { slug: string } | { slug: string }[] | null
  const specialtySlug = Array.isArray(specialtyRaw)
    ? (specialtyRaw[0]?.slug ?? 'unknown')
    : (specialtyRaw?.slug ?? 'unknown')

  // Baixa PDF do bucket
  const { data: fileData, error: dlError } = await supabase.storage
    .from('exam-pdfs')
    .download(exam.source_pdf_path)

  if (dlError || !fileData) {
    await supabase.from('exams').update({ status: 'error' }).eq('id', exam_id)
    return
  }

  const pdfBuffer = Buffer.from(await fileData.arrayBuffer())

  // Rasteriza o PDF em imagens JPEG
  let pages: Awaited<ReturnType<typeof rasterizePdf>>
  try {
    pages = await rasterizePdf(pdfBuffer)
  } catch {
    await supabase.from('exams').update({ status: 'error' }).eq('id', exam_id)
    return
  }

  if (pages.length === 0) {
    await supabase.from('exams').update({ status: 'error' }).eq('id', exam_id)
    return
  }

  let hasErrors = false

  // Processa em lotes de MAX_IMAGES_PER_CALL páginas
  for (let batchStart = 0; batchStart < pages.length; batchStart += MAX_IMAGES_PER_CALL) {
    const batch = pages.slice(batchStart, batchStart + MAX_IMAGES_PER_CALL)
    const imageBase64s = batch.map((p) => p.jpegBase64)

    let extracted: ExtractedQuestion[]
    try {
      const raw = await extractFromImages({ imageBase64s, prompt: EXTRACTION_PROMPT })
      extracted = parseJSON<ExtractedQuestion[]>(raw)
    } catch {
      hasErrors = true
      continue
    }

    for (const q of extracted) {
      if (!q.is_complete) continue

      // Normaliza confidence para escala 1–5 preservando o inteiro
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
  }

  // ── Pós-extração ─────────────────────────────────────────────────────────

  // 1. Sincroniza correct_answer do gabarito (se já foi processado)
  try {
    await supabase.rpc('sync_correct_answers', { p_exam_id: exam_id })
  } catch {
    // Não bloqueia o fluxo — gabarito pode não ter sido enviado ainda
  }

  // 2. Questões extraídas com sucesso passam para revisão
  await supabase
    .from('questions')
    .update({ status: 'pending_review' })
    .eq('exam_id', exam_id)
    .eq('status', 'pending_extraction')

  // 3. Fase de classificação por IA
  await supabase.from('exams').update({ status: 'classifying' }).eq('id', exam_id)
  await runClassification(exam_id)

  // 4. Status final
  await supabase
    .from('exams')
    .update({ status: hasErrors ? 'error' : 'done' })
    .eq('id', exam_id)
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: { exam_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { exam_id } = body
  if (!exam_id) {
    return NextResponse.json({ error: 'exam_id é obrigatório' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: exam, error: examError } = await supabase
    .from('exams')
    .select('id, source_pdf_path')
    .eq('id', exam_id)
    .single()

  if (examError || !exam) {
    return NextResponse.json({ error: 'Exame não encontrado' }, { status: 404 })
  }
  if (!exam.source_pdf_path) {
    return NextResponse.json({ error: 'Exame não possui PDF da prova' }, { status: 422 })
  }

  // Marca como extracting e responde imediatamente (202 Accepted)
  await supabase.from('exams').update({ status: 'extracting' }).eq('id', exam_id)

  // Pipeline completo roda em background — cliente acompanha via Realtime
  runExtraction(exam_id).catch(async () => {
    await supabase.from('exams').update({ status: 'error' }).eq('id', exam_id)
  })

  return NextResponse.json({ ok: true, queued: true }, { status: 202 })
}
