import { NextRequest, NextResponse } from 'next/server'
import { requireSimuladoAccess } from '@/lib/auth/guards'
import { createServiceClient } from '@/lib/supabase/service'
import type { ContentFlags, ExportData } from '@/lib/exports/build'
import {
  loadQuestionsForExport,
  renderExport,
  parseFormat,
  safeFilename,
} from '@/lib/exports/load'
import { ensureTeacherTips } from '@/lib/extraction/pipeline'
import { uploadFile, getExportUrl } from '@/lib/storage/signed-urls'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function flag(value: string | null, defaultValue: boolean): boolean {
  if (value == null) return defaultValue
  return value === '1' || value === 'true'
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const service = createServiceClient()

  const { data: simulado } = await service
    .from('simulados')
    .select('id, title, created_by, filters_used')
    .eq('id', id)
    .single()

  if (!simulado) return NextResponse.json({ error: 'Simulado não encontrado' }, { status: 404 })

  // Authz: dono OU admin/superadmin
  const guard = await requireSimuladoAccess(simulado.created_by)
  if (!guard.ok) {
    const status = guard.error === 'Não autenticado' ? 401 : 403
    return NextResponse.json({ error: guard.error }, { status })
  }

  const url = req.nextUrl
  const format = parseFormat(url.searchParams.get('format'))

  const content: ContentFlags = {
    enunciado: flag(url.searchParams.get('enunciado'), true),
    alternativas: flag(url.searchParams.get('alternativas'), true),
    figuras: flag(url.searchParams.get('figuras'), true),
    gabarito: flag(url.searchParams.get('gabarito'), true),
    coment_alt: flag(url.searchParams.get('coment_alt'), false),
    coment_compilado: flag(url.searchParams.get('coment_compilado'), false),
    taxonomia: flag(url.searchParams.get('taxonomia'), false),
    referencias: flag(url.searchParams.get('referencias'), false),
    dica_professor: flag(url.searchParams.get('dica_professor'), false),
  }

  // Ordem + notas posicionais do simulado
  const { data: sqRows } = await service
    .from('simulado_questions')
    .select('position, note, question_id')
    .eq('simulado_id', id)
    .order('position', { ascending: true })

  const orderedRows = (sqRows ?? []) as Array<{
    position: number
    note: string | null
    question_id: string
  }>
  const questionIds = orderedRows.map((r) => r.question_id)
  const notesByQuestion = new Map<string, string | null>(
    orderedRows.map((r) => [r.question_id, r.note])
  )

  // Fallback sob demanda: gera dicas que faltam antes de renderizar.
  if (content.dica_professor && questionIds.length > 0) {
    await ensureTeacherTips(questionIds)
  }

  const questions = await loadQuestionsForExport(questionIds, content, format, notesByQuestion)

  const sourceFlavor = (() => {
    const parts: string[] = []
    if (simulado.filters_used && typeof simulado.filters_used === 'object') {
      const f = simulado.filters_used as Record<string, unknown>
      if (typeof f.modulo === 'string') parts.push(f.modulo)
      if (typeof f.especialidade === 'string') parts.push(f.especialidade)
    }
    return parts.length ? parts.join(' · ') : 'MedMaestro'
  })()

  const data: ExportData = {
    title: simulado.title as string,
    subtitle: `${questions.length} questões  ·  ${sourceFlavor}`,
    questions,
    content,
  }

  const { bytes, mime, ext } = await renderExport(data, format)
  const filename = `${safeFilename(simulado.title as string, 'simulado')}.${ext}`

  // ?store=1 → upload em bucket `exports` e retorna signed URL compartilhável
  if (flag(url.searchParams.get('store'), false)) {
    const path = `${simulado.id}/${Date.now()}-${filename}`
    await uploadFile('exports', path, bytes, mime)
    const signedUrl = await getExportUrl(path)

    await service
      .from('simulados')
      .update({ export_path: path, exported_at: new Date().toISOString() })
      .eq('id', simulado.id)

    return NextResponse.json({
      ok: true,
      url: signedUrl,
      path,
      filename,
      expires_in: 600,
    })
  }

  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return new NextResponse(ab as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(bytes.byteLength),
    },
  })
}
