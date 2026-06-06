import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { GerarSimuladoForm, type GerarFilters } from '@/components/simulados/gerar-simulado-form'

export const metadata = { title: 'Gerar simulado — MedMaestro' }

type SearchParams = {
  banca?: string
  modulo?: string
  tema?: string
  tipo?: string
  recurso?: string
  dificuldade?: string
  year?: string
  status?: string
  classificacao?: string
  q?: string
}

const STATUS_LABELS: Record<string, string> = {
  pending_extraction: 'Aguardando extração',
  pending_review: 'Aguardando revisão',
  in_review: 'Em revisão',
  pending_approval: 'Aguardando aprovação',
  approved: 'Aprovada',
  published: 'Publicada',
  rejected: 'Rejeitada',
  needs_attention: 'Requer atenção',
}

const CLASSIF_LABELS: Record<string, string> = {
  classificadas: 'Classificadas',
  nao: 'Não classificadas',
}

function parseList(v?: string): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

export default async function GerarSimuladoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  // Mapas slug→label para exibir os filtros ativos como chips.
  const [modRes, temaRes, tipoRes, recRes, difRes, boardRes] = await Promise.all([
    service.from('tags').select('slug, label').eq('dimension', 'modulo'),
    service.from('tags').select('slug, label').eq('dimension', 'topico_edital'),
    service.from('tags').select('slug, label').eq('dimension', 'tipo_questao'),
    service.from('tags').select('slug, label').eq('dimension', 'recurso_visual'),
    service.from('tags').select('slug, label').eq('dimension', 'dificuldade'),
    service.from('exam_boards').select('slug, short_name'),
  ])

  const labelMap = (rows: { slug: string; label: string }[] | null) =>
    Object.fromEntries((rows ?? []).map((r) => [r.slug, r.label]))

  const maps: Record<string, Record<string, string>> = {
    modulo: labelMap(modRes.data as { slug: string; label: string }[] | null),
    tema: labelMap(temaRes.data as { slug: string; label: string }[] | null),
    tipo: labelMap(tipoRes.data as { slug: string; label: string }[] | null),
    recurso: labelMap(recRes.data as { slug: string; label: string }[] | null),
    dificuldade: labelMap(difRes.data as { slug: string; label: string }[] | null),
    banca: Object.fromEntries(
      ((boardRes.data ?? []) as { slug: string; short_name: string }[]).map((b) => [b.slug, b.short_name])
    ),
    status: STATUS_LABELS,
    classificacao: CLASSIF_LABELS,
  }
  const prefix: Record<string, string> = {
    banca: 'Banca', modulo: 'Módulo', tema: 'Tema', tipo: 'Tipo',
    recurso: 'Imagem', dificuldade: 'Dificuldade', year: 'Ano', status: 'Status',
  }

  const activeChips: string[] = []
  for (const key of ['banca', 'modulo', 'tema', 'tipo', 'recurso', 'dificuldade', 'year', 'status'] as const) {
    for (const slug of parseList(params[key])) {
      const lbl = maps[key]?.[slug] ?? slug
      activeChips.push(`${prefix[key]}: ${lbl}`)
    }
  }
  if (params.classificacao) activeChips.push(CLASSIF_LABELS[params.classificacao] ?? params.classificacao)
  if (params.q) activeChips.push(`"${params.q}"`)

  // Pool completo (com tags) via RPC para contar e montar breakdowns.
  const { data: rpcData } = await service.rpc('search_questions', {
    p_modulo: parseList(params.modulo),
    p_tema: parseList(params.tema),
    p_tipo: parseList(params.tipo),
    p_recurso: parseList(params.recurso),
    p_dificuldade: parseList(params.dificuldade),
    p_banca: parseList(params.banca),
    p_year: parseList(params.year).map(Number).filter((n) => !Number.isNaN(n)),
    p_status: parseList(params.status),
    p_classificacao: params.classificacao || null,
    p_search: params.q?.trim() || null,
    p_limit: 5000,
    p_offset: 0,
  })

  type PoolRow = { id: string; tags?: { label: string; dimension: string }[] }
  const result = (rpcData?.[0] ?? { total: 0, rows: [] }) as { total: number; rows: PoolRow[] }
  const pool = result.rows ?? []
  const poolCount = Number(result.total) || pool.length

  const countBy = (dim: string) => {
    const m = new Map<string, number>()
    for (const q of pool) {
      const tag = (q.tags ?? []).find((t) => t.dimension === dim)
      if (!tag) continue
      m.set(tag.label, (m.get(tag.label) ?? 0) + 1)
    }
    return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }

  const difBreakdown = countBy('dificuldade')
  const modBreakdown = countBy('modulo')

  const filters: GerarFilters = {
    banca: params.banca ?? '',
    modulo: params.modulo ?? '',
    tema: params.tema ?? '',
    tipo: params.tipo ?? '',
    recurso: params.recurso ?? '',
    dificuldade: params.dificuldade ?? '',
    year: params.year ?? '',
    status: params.status ?? '',
    classificacao: params.classificacao ?? '',
    q: params.q ?? '',
  }

  const titleBase = activeChips
    .filter((c) => c.startsWith('Módulo:') || c.startsWith('Tema:'))
    .map((c) => c.split(': ')[1])
    .slice(0, 2)
    .join(' / ')
  const suggestedTitle = `Simulado${titleBase ? ' — ' + titleBase : ' personalizado'}`

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/questoes" className="text-sm text-[var(--mm-muted)] transition-colors hover:text-foreground">
          ← Voltar às questões
        </Link>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-syne)] text-2xl font-semibold text-foreground">
          Gerar simulado
        </h1>
        <p className="text-sm text-[var(--mm-muted)]">
          A partir dos filtros aplicados na tela de Questões. Defina tamanho, distribuição e formato do caderno.
        </p>
      </header>

      <GerarSimuladoForm
        filters={filters}
        activeChips={activeChips}
        poolCount={poolCount}
        difBreakdown={difBreakdown}
        modBreakdown={modBreakdown}
        suggestedTitle={suggestedTitle}
      />
    </div>
  )
}
