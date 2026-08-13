import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ROLE_LABELS } from '@/types'
import { Card, CardBody, KpiCard } from '@/components/ui'
import { CheckCircle2, Database, MessageSquare, ClipboardList } from 'lucide-react'
import { LotesTableClient, type LoteRow } from './lotes-table-client'
import { IncidenciaTemaClient, type TemaRow } from './incidencia-tema-client'

export const metadata = { title: 'Dashboard — MedMaestro' }

const MODULOS = [
  { label: 'Cardiovascular', color: '#D3402A' },
  { label: 'Respiratório', color: '#2B5A9C' },
  { label: 'Neurológico', color: '#7B3FA0' },
  { label: 'Renal e Distúrbios HE', color: '#319498' },
  { label: 'Infectologia e Sepse', color: '#F26B43' },
  { label: 'Gastro e Nutrição', color: '#006048' },
  { label: 'Hemato e Oncologia', color: '#B6014F' },
  { label: 'Trauma e Cirurgia', color: '#8D6E63' },
  { label: 'Medicina Perioperatória', color: '#9E6606' },
  { label: 'Ética e Qualidade', color: '#5F7288' },
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const service = createServiceClient()

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const monthStartISO = monthStart.toISOString()

  const [
    profileRes,
    totalQuestoesRes,
    kpisRes,
    lotesRes,
    modTagsRes,
    examsTableRes,
    lastExamRes,
    apiUsageMonthRes,
  ] = await Promise.all([
    service.from('profiles').select('role, full_name').eq('id', user!.id).single(),
    service.from('questions').select('id', { count: 'exact', head: true }),
    // RPC: conta QUESTÕES DISTINTAS classificadas/comentadas (não linhas de
    // question_tags/question_comments, que inflavam o número p/ >100%).
    service.rpc('get_dashboard_kpis').single(),
    service.from('exams').select('id', { count: 'exact', head: true }),
    service
      .from('question_tags')
      .select(
        'tags!inner(label, dimension), questions!inner(exams!inner(year, exam_boards(short_name, name)))'
      )
      .eq('tags.dimension', 'modulo'),
    service
      .from('exams')
      .select(
        'id, year, booklet_color, status, created_at, exam_boards(name, short_name), specialties(name)'
      )
      .order('created_at', { ascending: false }),
    service
      .from('exams')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from('api_usage')
      .select('cost_usd, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens')
      .gte('created_at', monthStartISO),
  ])

  const profile = profileRes.data
  const name = profile?.full_name ?? user?.email ?? 'Usuário'
  const roleLabel = ROLE_LABELS[profile?.role as keyof typeof ROLE_LABELS] ?? ''

  const kpis = (kpisRes.data ?? null) as {
    total_questoes: number
    classificadas: number
    comentadas: number
    provas: number
  } | null

  const totalQuestoes = totalQuestoesRes.count ?? 0
  const classificadas = Number(kpis?.classificadas ?? 0)
  const comentadas = Number(kpis?.comentadas ?? 0)
  const totalLotes = lotesRes.count ?? 0

  const apiRows = apiUsageMonthRes.data ?? []
  const apiCostUsdMonth = apiRows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)
  const apiTokensMonth = apiRows.reduce(
    (s, r) =>
      s +
      (Number(r.input_tokens ?? 0) +
        Number(r.output_tokens ?? 0) +
        Number(r.cache_read_input_tokens ?? 0) +
        Number(r.cache_creation_input_tokens ?? 0)),
    0
  )

  // Uma linha por tag de módulo, já carregando ano e banca da questão, para
  // permitir filtrar a incidência por banca + ano(s) no cliente.
  const temaRows: TemaRow[] = []
  for (const row of modTagsRes.data ?? []) {
    const tag = row.tags as unknown as { label: string } | null
    const q = row.questions as unknown as {
      exams: {
        year: number
        exam_boards: { short_name: string | null; name: string | null } | null
      } | null
    } | null
    if (!tag || !q?.exams) continue
    const board =
      q.exams.exam_boards?.short_name ?? q.exams.exam_boards?.name ?? '—'
    temaRows.push({ label: tag.label, year: q.exams.year, board })
  }

  const moduloColors = Object.fromEntries(
    MODULOS.map((m) => [m.label, m.color])
  )
  const moduloOrder = MODULOS.map((m) => m.label)

  const exams: LoteRow[] = (examsTableRes.data ?? []).map((e) => {
    const board = e.exam_boards as unknown as { name: string; short_name: string } | null
    const specialty = e.specialties as unknown as { name: string } | null
    return {
      id: e.id as string,
      year: e.year as number,
      booklet_color: (e.booklet_color as string | null) ?? null,
      status: (e.status as string | null) ?? 'pending',
      board: board?.short_name ?? '—',
      specialty: specialty?.name ?? '—',
    }
  })

  const lastUpdated = lastExamRes.data?.updated_at as string | undefined

  const years = exams.map((e) => e.year).filter(Number.isFinite)
  const minYear = years.length > 0 ? Math.min(...years) : new Date().getFullYear()
  const maxYear = years.length > 0 ? Math.max(...years) : new Date().getFullYear()

  const classifPct = totalQuestoes > 0 ? Math.round((classificadas / totalQuestoes) * 100) : 0
  const comentPct = totalQuestoes > 0 ? Math.round((comentadas / totalQuestoes) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-syne)] text-xl font-bold text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-[13px] text-[var(--mm-muted)]">
          Olá, <span className="text-[var(--mm-text2)]">{name.split(' ')[0]}</span>
          {' · '}
          {roleLabel}
          {' · '}Banco {minYear === maxYear ? minYear : `${minYear}–${maxYear}`}
          {lastUpdated && (
            <>
              {' · '}Última atualização:{' '}
              {new Date(lastUpdated).toLocaleDateString('pt-BR')}
            </>
          )}
        </p>
      </div>

      {/* KPIs (4 cards com tone semântico) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          tone="total"
          label="Questões no banco"
          icon={<Database className="size-3" />}
          value={totalQuestoes.toLocaleString('pt-BR')}
          info="Total de questões originais cadastradas no banco. Não inclui variações geradas por IA."
        />
        <KpiCard
          tone="ok"
          label="Classificadas"
          icon={<CheckCircle2 className="size-3" />}
          value={classificadas.toLocaleString('pt-BR')}
          valueClassName="text-[var(--mm-green)]"
          delta={
            totalQuestoes > 0
              ? { direction: 'up', text: `${classifPct}% do total` }
              : undefined
          }
          info="Questões que receberam ao menos uma tag curricular (módulo, tipo, dificuldade etc.). Conta questões distintas — uma questão com várias tags vale 1. O percentual é sobre o total de questões no banco."
        />
        <KpiCard
          tone="info"
          label="Comentadas"
          icon={<MessageSquare className="size-3" />}
          value={comentadas.toLocaleString('pt-BR')}
          delta={
            totalQuestoes > 0
              ? { direction: 'neutral', text: `${comentPct}% cobertura` }
              : undefined
          }
          info="Questões com ao menos um comentário editorial. Conta questões distintas — uma questão com vários comentários vale 1. 'Cobertura' é o percentual sobre o total do banco."
        />
        <KpiCard
          tone="pending"
          label="Provas importadas"
          icon={<ClipboardList className="size-3" />}
          value={totalLotes.toLocaleString('pt-BR')}
          valueClassName="text-[var(--mm-gold)]"
          info="Cadernos de prova (exams) importados para o banco."
        />
      </div>

      {/* Consumo da API Claude (mês corrente) */}
      <ApiUsageCard costUsd={apiCostUsdMonth} tokens={apiTokensMonth} />

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Incidência por tema — filtrável por banca + ano(s) */}
        <IncidenciaTemaClient
          rows={temaRows}
          colors={moduloColors}
          order={moduloOrder}
        />
      </div>

      {/* Lotes importados (preserva client com filtros + paginação) */}
      <LotesTableClient exams={exams} />
    </div>
  )
}

function ApiUsageCard({ costUsd, tokens }: { costUsd: number; tokens: number }) {
  const monthLabel = new Date().toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
  const costFmt = costUsd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const tokensFmt =
    tokens >= 1_000_000
      ? `${(tokens / 1_000_000).toFixed(2)}M`
      : tokens >= 1_000
        ? `${(tokens / 1_000).toFixed(1)}k`
        : tokens.toString()
  return (
    <Card>
      <CardBody className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--mm-muted)]">
            Consumo API Claude · {monthLabel}
          </div>
          <div
            className="mt-1 font-[family-name:var(--font-syne)] text-[28px] font-extrabold leading-none"
            style={{
              background:
                'linear-gradient(135deg, var(--mm-gold), var(--mm-gold-light))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {costFmt}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-[var(--mm-muted)]">Tokens (mês)</div>
          <div className="mt-0.5 font-[family-name:var(--font-syne)] text-[18px] font-bold text-[var(--mm-text2)]">
            {tokensFmt}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
