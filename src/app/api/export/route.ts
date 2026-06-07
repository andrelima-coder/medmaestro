import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { ContentFlags, ExportData } from '@/lib/exports/build'
import {
  loadQuestionsForExport,
  renderExport,
  parseFormat,
  safeFilename,
} from '@/lib/exports/load'
import { ensureTeacherTips } from '@/lib/extraction/pipeline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function flag(value: string | null, defaultValue: boolean): boolean {
  if (value == null) return defaultValue
  return value === '1' || value === 'true'
}

function csv(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Export direto a partir dos filtros do Banco de Questões — sem precisar
 * salvar um simulado. Mesma amostragem (RPC sample_questions) usada em
 * /simulados/gerar, depois renderiza PDF/DOCX/XLSX/PPTX na hora.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const url = req.nextUrl
  const sp = url.searchParams

  const format = parseFormat(sp.get('format'))

  const content: ContentFlags = {
    enunciado: flag(sp.get('enunciado'), true),
    alternativas: flag(sp.get('alternativas'), true),
    figuras: flag(sp.get('figuras'), true),
    gabarito: flag(sp.get('gabarito'), true),
    coment_alt: flag(sp.get('coment_alt'), false),
    coment_compilado: flag(sp.get('coment_compilado'), false),
    taxonomia: flag(sp.get('taxonomia'), false),
    referencias: flag(sp.get('referencias'), false),
    dica_professor: flag(sp.get('dica_professor'), false),
  }

  const total = Math.max(1, Math.min(parseInt(sp.get('total') ?? '20', 10) || 20, 500))
  const proportionRaw = (sp.get('proportion') || 'random').toLowerCase()
  // 'tema' mapeia para a dimensão 'modulo' (mesma convenção de createSimuladoFromFiltersAction)
  const mode =
    proportionRaw === 'tema'
      ? 'modulo'
      : proportionRaw === 'dificuldade'
        ? 'dificuldade'
        : 'random'

  const filters = {
    modulo: csv(sp.get('modulo')),
    tema: csv(sp.get('tema')),
    tipo: csv(sp.get('tipo')),
    recurso: csv(sp.get('recurso')),
    dificuldade: csv(sp.get('dificuldade')),
    banca: csv(sp.get('banca')),
    year: csv(sp.get('year'))
      .map(Number)
      .filter((n) => !Number.isNaN(n)),
    status: csv(sp.get('status')),
    classificacao: sp.get('classificacao') || null,
    search: (sp.get('q') || '').trim() || null,
  }

  const service = createServiceClient()
  const { data: sampleData, error: rpcErr } = await service.rpc('sample_questions', {
    p_modulo: filters.modulo,
    p_tema: filters.tema,
    p_tipo: filters.tipo,
    p_recurso: filters.recurso,
    p_dificuldade: filters.dificuldade,
    p_banca: filters.banca,
    p_year: filters.year,
    p_status: filters.status,
    p_classificacao: filters.classificacao,
    p_search: filters.search,
    p_total: total,
    p_mode: mode,
  })

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  const questionIds = ((sampleData ?? []) as { id: string }[]).map((r) => r.id)
  if (questionIds.length === 0) {
    return NextResponse.json(
      { error: 'Nenhuma questão corresponde aos filtros selecionados.' },
      { status: 422 }
    )
  }

  // Fallback sob demanda: gera dicas que faltam antes de renderizar.
  if (content.dica_professor) {
    await ensureTeacherTips(questionIds)
  }

  const questions = await loadQuestionsForExport(questionIds, content, format)

  const title = (sp.get('title') || 'Banco de Questões TEMI').trim() || 'Banco de Questões TEMI'
  const data: ExportData = {
    title,
    subtitle: `${questions.length} questões  ·  MedMaestro`,
    questions,
    content,
  }

  const { bytes, mime, ext } = await renderExport(data, format)
  const filename = `${safeFilename(title, 'questoes')}.${ext}`

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
