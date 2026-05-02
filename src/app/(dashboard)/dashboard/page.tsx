import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ROLE_LABELS } from '@/types'
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  KpiCard,
  ParetoBar,
} from '@/components/ui'
import { CheckCircle2, Database, MessageSquare, ClipboardList } from 'lucide-react'
import { LotesTableClient, type LoteRow } from './lotes-table-client'

export const metadata = { title: 'Dashboard — MedMaestro' }

const MODULOS = [
  { label: 'Cardiovascular', color: '#EF5350' },
  { label: 'Respiratório', color: '#42A5F5' },
  { label: 'Neurológico', color: '#AB47BC' },
  { label: 'Renal e Distúrbios HE', color: '#26A69A' },
  { label: 'Infectologia e Sepse', color: '#FF7043' },
  { label: 'Gastro e Nutrição', color: '#66BB6A' },
  { label: 'Hemato e Oncologia', color: '#EC407A' },
  { label: 'Trauma e Cirurgia', color: '#8D6E63' },
  { label: 'Medicina Perioperatória', color: '#FFA726' },
  { label: 'Ética e Qualidade', color: '#78909C' },
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
    classificadasRes,
    comentadasRes,
    lotesRes,
    modTagsRes,
    examsTableRes,
    lastExamRes,
    apiUsageMonthRes,
  ] = await Promise.all([
    service.from('user_profiles').select('role, full_name').eq('id', user!.id).single(),
    service.from('questions').select('id', { count: 'exact', head: true }),
    service.from('question_tags').select('question_id', { count: 'exact', head: true }),
    service.from('question_comments').select('question_id', { count: 'exact', head: true }),
    service.from('exams').select('id', { count: 'exact', head: true }),
    service
      .from('question_tags')
      .select('question_id, tags!inner(label, color, dimension)')
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

  const totalQuestoes = totalQuestoesRes.count ?? 0
  const classificadas = classificadasRes.count ?? 0
  const comentadas = comentadasRes.count ?? 0
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

  const moduloCount: Record<string, number> = {}
  for (const row of modTagsRes.data ?? []) {
    const tag = row.tags as unknown as
      | { label: string; color: string; dimension: string }
      | null
    if (!tag) continue
    moduloCount[tag.label] = (moduloCount[tag.label] ?? 0) + 1
  }

  const totalTagged = Object.values(moduloCount).reduce((s, v) => s + v, 0)

  const modulosData = MODULOS.map((m) => ({
    ...m,
    count: moduloCount[m.label] ?? 0,
  }))

  const maxCount = Math.max(...modulosData.map((m) => m.count), 1)

  const top8 = [...modulosData].sort((a, b) => b.count - a.count).slice(0, 8)

  const sorted = [...modulosData].sort((a, b) => b.count - a.count)
  const top3Sum = sorted.slice(0, 3).reduce((s, m) => s + m.count, 0)
  const top3Pct = totalTagged > 0 ? Math.round((top3Sum / totalTagged) * 100) : 0
  const top3Names = sorted
    .slice(0, 3)
    .map((m, i) => `M${i + 1} ${m.label.split(' ')[0]}`)
    .join(' + ')

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
        />
        <KpiCard
          tone="pending"
          label="Provas importadas"
          icon={<ClipboardList className="size-3" />}
          value={totalLotes.toLocaleString('pt-BR')}
          valueClassName="text-[var(--mm-gold)]"
        />
      </div>

      {/* Consumo da API Claude (mês corrente) */}
      <ApiUsageCard costUsd={apiCostUsdMonth} tokens={apiTokensMonth} />

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Distribuição por módulo — barras verticais */}
        <Card glow="purple" accent="purple">
          <CardHeader>
            <CardTitle>Distribuição por módulo</CardTitle>
            <span
              className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold"
              style={{
                background: 'var(--mm-gold-bg)',
                color: 'var(--mm-gold)',
                borderColor: 'var(--mm-gold-border)',
              }}
            >
              Pareto 80/20
            </span>
          </CardHeader>
          <CardBody>
            <div className="flex h-[140px] items-end gap-2">
              {modulosData.map((m, i) => {
                const pct = maxCount > 0 ? (m.count / maxCount) * 100 : 0
                return (
                  <div
                    key={m.label}
                    className="flex flex-1 flex-col items-center gap-1"
                    title={`${m.label}: ${m.count}`}
                  >
                    <span
                      className="font-[family-name:var(--font-syne)] text-[11px] font-bold"
                      style={{
                        color: m.count === 0 ? 'var(--mm-muted)' : 'var(--mm-text2)',
                      }}
                    >
                      {m.count}
                    </span>
                    <div
                      className="w-full rounded-t transition-all duration-300"
                      style={{
                        height: `${Math.max(pct, 2)}%`,
                        minHeight: 4,
                        background:
                          m.count === 0
                            ? 'rgba(255,255,255,0.05)'
                            : `linear-gradient(180deg, ${m.color}, ${m.color}80)`,
                      }}
                    />
                    <span className="text-[9px] tracking-wider text-[var(--mm-muted)]">
                      M{i + 1}
                    </span>
                  </div>
                )
              })}
            </div>

            {totalTagged > 0 && top3Sum > 0 && (
              <p className="mt-4 border-t border-[var(--mm-line2)] pt-3 text-[11px] text-[var(--mm-muted)]">
                <span className="font-bold text-[var(--mm-gold)]">●</span> {top3Names} ={' '}
                <span className="font-bold text-[var(--mm-gold)]">{top3Pct}%</span> das
                classificações
              </p>
            )}
          </CardBody>
        </Card>

        {/* Incidência por tema — usa ParetoBar do design system */}
        <Card>
          <CardHeader>
            <CardTitle>Incidência por tema</CardTitle>
            <span
              className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold"
              style={{
                background: 'var(--mm-gold-bg)',
                color: 'var(--mm-gold)',
                borderColor: 'var(--mm-gold-border)',
              }}
            >
              Top 8
            </span>
          </CardHeader>
          <CardBody>
            {totalTagged === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--mm-muted)]">
                Nenhuma questão classificada ainda
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {top8.map((m) => {
                  const pct = totalTagged > 0 ? Math.round((m.count / totalTagged) * 100) : 0
                  return (
                    <ParetoBar
                      key={m.label}
                      module={m.label}
                      count={m.count}
                      widthPct={pct}
                      percentLabel={`${pct}%`}
                      color={m.color}
                    />
                  )
                })}
              </div>
            )}
          </CardBody>
        </Card>
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
