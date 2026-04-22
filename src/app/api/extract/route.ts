import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { extractFromImages, parseJSON, MAX_IMAGES_PER_CALL, MODELS } from '@/lib/ai/claude'
import { uploadFile } from '@/lib/storage/signed-urls'
import { rasterizePdf } from '@/lib/pdf/rasterize'

const EXTRACTION_PROMPT = `Você é um extrator de questões de provas médicas brasileiras (TEMI/AMIB).
Analise estas páginas e extraia TODAS as questões visíveis.

Para cada questão, retorne um objeto JSON com:
- question_number: número da questão (inteiro)
- stem: enunciado completo
- alternatives: { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." }
- has_images: boolean (true se a questão contém imagens, figuras ou tabelas)
- image_type: "ecg"|"radiografia"|"tomografia"|"ultrassom"|"grafico"|"tabela"|"esquema"|"outro" (null se has_images=false)
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

// Mapeia o tipo de imagem retornado pelo Claude ao enum do banco
const IMAGE_TYPE_MAP: Record<string, string> = {
  ecg: 'ecg',
  radiografia: 'xray',
  tomografia: 'ct_scan',
  ultrassom: 'ultrasound',
  grafico: 'graph',
  tabela: 'table',
  esquema: 'diagram',
  outro: 'other',
}

function checkAuth(request: Request): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
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

  // 1. Busca exame + specialty slug para montar o path das imagens
  const { data: exam, error: examError } = await supabase
    .from('exams')
    .select('id, pdf_path, year, color, specialty_id, specialties(slug)')
    .eq('id', exam_id)
    .single()

  if (examError || !exam) {
    return NextResponse.json({ error: 'Exame não encontrado' }, { status: 404 })
  }
  if (!exam.pdf_path) {
    return NextResponse.json({ error: 'Exame não possui pdf_path' }, { status: 422 })
  }

  const specialtyRaw = exam.specialties as { slug: string } | { slug: string }[] | null
  const specialtySlug = Array.isArray(specialtyRaw)
    ? (specialtyRaw[0]?.slug ?? 'unknown')
    : (specialtyRaw?.slug ?? 'unknown')

  // Marca exame como "extracting"
  await supabase.from('exams').update({ status: 'extracting' }).eq('id', exam_id)

  // 2. Baixa PDF do bucket
  const { data: fileData, error: dlError } = await supabase.storage
    .from('exam-pdfs')
    .download(exam.pdf_path)

  if (dlError || !fileData) {
    await supabase.from('exams').update({ status: 'error' }).eq('id', exam_id)
    return NextResponse.json(
      { error: `Falha ao baixar PDF: ${dlError?.message}` },
      { status: 500 }
    )
  }

  const pdfBuffer = Buffer.from(await fileData.arrayBuffer())

  // 3. Rasteriza o PDF
  let pages: Awaited<ReturnType<typeof rasterizePdf>>
  try {
    pages = await rasterizePdf(pdfBuffer)
  } catch (err) {
    await supabase.from('exams').update({ status: 'error' }).eq('id', exam_id)
    return NextResponse.json(
      { error: `Falha ao rasterizar PDF: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }

  if (pages.length === 0) {
    await supabase.from('exams').update({ status: 'error' }).eq('id', exam_id)
    return NextResponse.json({ error: 'Nenhuma página gerada pelo rasterizador' }, { status: 422 })
  }

  let questionsCreated = 0
  let imagesUploaded = 0
  const errors: string[] = []

  // 4. Processa em lotes de MAX_IMAGES_PER_CALL páginas
  for (let batchStart = 0; batchStart < pages.length; batchStart += MAX_IMAGES_PER_CALL) {
    const batch = pages.slice(batchStart, batchStart + MAX_IMAGES_PER_CALL)
    const imageBase64s = batch.map((p) => p.jpegBase64)

    let extracted: ExtractedQuestion[]
    try {
      const raw = await extractFromImages({ imageBase64s, prompt: EXTRACTION_PROMPT })
      extracted = parseJSON<ExtractedQuestion[]>(raw)
    } catch (err) {
      errors.push(
        `Lote páginas ${batch[0].pageNumber}–${batch[batch.length - 1].pageNumber}: ${err instanceof Error ? err.message : String(err)}`
      )
      continue
    }

    for (const q of extracted) {
      if (!q.is_complete) continue // ignora questões cortadas entre páginas

      const confidenceScore = Math.max(0, Math.min(5, q.confidence)) / 5
      const status = q.confidence >= 4 ? 'extracted' : 'flagged'

      // 5. Insere questão no banco
      const { data: inserted, error: insertError } = await supabase
        .from('questions')
        .upsert(
          {
            exam_id,
            question_no: q.question_number,
            stem: q.stem,
            alternative_a: q.alternatives['A'] ?? null,
            alternative_b: q.alternatives['B'] ?? null,
            alternative_c: q.alternatives['C'] ?? null,
            alternative_d: q.alternatives['D'] ?? null,
            alternative_e: q.alternatives['E'] ?? null,
            has_image: q.has_images,
            confidence_score: confidenceScore,
            extraction_model: MODELS.sonnet,
            status,
          },
          { onConflict: 'exam_id,question_no' }
        )
        .select('id')
        .single()

      if (insertError || !inserted) {
        errors.push(`Questão ${q.question_number}: ${insertError?.message}`)
        continue
      }

      questionsCreated++

      // 6. Upload de imagens e registro em question_images
      if (q.has_images && q.image_scope) {
        const imageType = IMAGE_TYPE_MAP[q.image_type ?? 'outro'] ?? 'other'
        const imageScope = q.image_scope.toLowerCase()

        for (const page of batch) {
          const imagePath = `${specialtySlug}/${exam.year}/${exam.color ?? 'unknown'}/q${q.question_number}/page_${page.pageNumber}.jpg`

          try {
            await uploadFile('question-images', imagePath, page.jpegBuffer, 'image/jpeg')
            imagesUploaded++
          } catch (err) {
            errors.push(`Upload imagem q${q.question_number} p${page.pageNumber}: ${err instanceof Error ? err.message : String(err)}`)
            continue
          }

          const { error: imgInsertError } = await supabase.from('question_images').insert({
            question_id: inserted.id,
            image_scope: imageScope,
            image_type: imageType,
            full_page_path: imagePath,
            page_number: page.pageNumber,
          })

          if (imgInsertError) {
            errors.push(`question_images q${q.question_number}: ${imgInsertError.message}`)
          }
        }
      }
    }
  }

  // 7. Atualiza status do exame
  await supabase
    .from('exams')
    .update({ status: errors.length === 0 ? 'done' : 'error' })
    .eq('id', exam_id)

  return NextResponse.json({
    ok: errors.length === 0,
    pages_processed: pages.length,
    questions_created: questionsCreated,
    images_uploaded: imagesUploaded,
    ...(errors.length > 0 && { errors }),
  })
}
