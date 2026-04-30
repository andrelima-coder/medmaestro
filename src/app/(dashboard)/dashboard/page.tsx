import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ROLE_LABELS } from '@/types'
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

  const [
    profileRes,
    totalQuestoesRes,
    classificadasRes,
    comentadasRes,
    lotesRes,
    modTagsRes,
    examsTableRes,
    lastExamRes,
  ] = await Promise.all([
    service.from('profiles').select('role, full_name').eq('id', user!.id).single(),
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
  ])

  const profile = profileRes.data
  const name = profile?.full_name ?? user?.email ?? 'Usuário'
  const roleLabel = ROLE_LABELS[profile?.role as keyof typeof ROLE_LABELS] ?? ''

  const totalQuestoes = totalQuestoesRes.count ?? 0
  const classificadas = classificadasRes.count ?? 0
  const comentadas = comentadasRes.count ?? 0
  const totalLotes = lotesRes.count ?? 0

  // Conta por módulo
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

  // Pareto: 3 maiores módulos somam X% do total
  const sorted = [...modulosData].sort((a, b) => b.count - a.count)
  const top3Sum = sorted.slice(0, 3).reduce((s, m) => s + m.count, 0)
  const top3Pct = totalTagged > 0 ? Math.round((top3Sum / totalTagged) * 100) : 0
  const top3Names = sorted.slice(0, 3).map((m, i) => `M${i + 1} ${m.label.split(' ')[0]}`).join(' + ')

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

  // Range de anos
  const years = exams.map((e) => e.year).filter(Number.isFinite)
  const minYear = years.length > 0 ? Math.min(...years) : new Date().getFullYear()
  const maxYear = years.length > 0 ? Math.max(...years) : new Date().getFullYear()

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1
          className="font-[family-name:var(--font-syne)]"
          style={{ fontSize: 24, fontWeight: 800, color: 'var(--mm-text)' }}
        >
          Dashboard — Visão geral
        </h1>
        <p style={{ fontSize: 12, color: 'var(--mm-muted)', marginTop: 4 }}>
          Olá, <span style={{ color: 'var(--mm-text2)' }}>{name.split(' ')[0]}</span>
          {' · '}{roleLabel}
          {' · '}Banco {minYear === maxYear ? minYear : `${minYear}–${maxYear}`}
          {lastUpdated && (
            <>
              {' · '}Última atualização:{' '}
              {new Date(lastUpdated).toLocaleDateString('pt-BR')}
            </>
          )}
        </p>
      </div>

      {/* Stat cards com gradient */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KPICard
          value={totalQuestoes}
          label="Questões no banco"
          gradient="linear-gradient(135deg, #D4A843, #F5D58C)"
          href="/questoes"
        />
        <KPICard
          value={classificadas}
          label="Classificadas"
          gradient="linear-gradient(135deg, #66BB6A, #A5D6A7)"
          href="/questoes"
        />
        <KPICard
          value={comentadas}
          label="Comentadas"
          gradient="linear-gradient(135deg, #4FC3F7, #81D4FA)"
          href="/comentarios"
        />
        <KPICard
          value={totalLotes}
          label="Provas importadas"
          gradient="linear-gradient(135deg, #BA68C8, #CE93D8)"
          href="/lotes"
        />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Distribuição por módulo */}
        <div
          style={{
            background: 'var(--mm-surface)',
            border: '1px solid var(--mm-line)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
            }}
          >
            <span
              className="font-[family-name:var(--font-syne)]"
              style={{ fontSize: 14, fontWeight: 700 }}
            >
              Distribuição por módulo
            </span>
            <span
              style={{
                background: 'var(--mm-gold-bg)',
                color: 'var(--mm-gold)',
                border: '1px solid var(--mm-gold-border)',
                fontSize: 10,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 20,
              }}
            >
              Pareto 80/20
            </span>
          </div>

          {/* Bar chart com label numérico */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 130 }}>
            {modulosData.map((m, i) => {
              const pct = maxCount > 0 ? (m.count / maxCount) * 100 : 0
              return (
                <div
                  key={m.label}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title={`${m.label}: ${m.count}`}
                >
                  <span
                    className="font-[family-name:var(--font-syne)]"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: m.count === 0 ? 'var(--mm-muted)' : 'var(--mm-text2)',
                    }}
                  >
                    {m.count}
                  </span>
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max(pct, 2)}%`,
                      background: m.count === 0
                        ? 'var(--mm-bg2)'
                        : `linear-gradient(180deg, ${m.color}, ${m.color}80)`,
                      borderRadius: '4px 4px 0 0',
                      minHeight: 4,
                      transition: 'all 0.3s',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 9,
                      color: 'var(--mm-muted)',
                      letterSpacing: '0.3px',
                    }}
                  >
                    M{i + 1}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Concentração 80/20 */}
          {totalTagged > 0 && top3Sum > 0 && (
            <p
              style={{
                fontSize: 11,
                color: 'var(--mm-muted)',
                marginTop: 16,
                paddingTop: 12,
                borderTop: '1px solid var(--mm-line2)',
              }}
            >
              <span style={{ color: 'var(--mm-gold)', fontWeight: 700 }}>●</span> {top3Names} ={' '}
              <span style={{ color: 'var(--mm-gold)', fontWeight: 700 }}>{top3Pct}%</span> das classificações
            </p>
          )}
        </div>

        {/* Incidência por tema */}
        <div
          style={{
            background: 'var(--mm-surface)',
            border: '1px solid var(--mm-line)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <span
              className="font-[family-name:var(--font-syne)]"
              style={{ fontSize: 14, fontWeight: 700 }}
            >
              Incidência por tema
            </span>
            <span
              style={{
                background: 'var(--mm-gold-bg)',
                color: 'var(--mm-gold)',
                border: '1px solid var(--mm-gold-border)',
                fontSize: 10,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 20,
              }}
            >
              Top 8
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {top8.map((m) => {
              const pct = totalTagged > 0 ? Math.round((m.count / totalTagged) * 100) : 0
              const pctColor =
                pct >= 80 ? 'var(--mm-gold)' :
                pct >= 60 ? '#4FC3F7' :
                pct >= 30 ? '#66BB6A' : 'var(--mm-muted)'
              return (
                <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--mm-text2)',
                      width: 140,
                      flexShrink: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.label}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      background: 'var(--mm-bg2)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        borderRadius: 3,
                        background: `linear-gradient(90deg, ${m.color}, ${m.color}99)`,
                        width: `${pct}%`,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: pctColor,
                      width: 36,
                      textAlign: 'right',
                      flexShrink: 0,
                      fontWeight: 700,
                      fontFamily: 'var(--font-syne)',
                    }}
                  >
                    {pct}%
                  </span>
                </div>
              )
            })}
            {totalTagged === 0 && (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--mm-muted)',
                  textAlign: 'center',
                  padding: '20px 0',
                }}
              >
                Nenhuma questão classificada ainda
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Lotes importados (client com filtros + paginação) */}
      <LotesTableClient exams={exams} />
    </div>
  )
}

function KPICard({
  value,
  label,
  gradient,
  href,
}: {
  value: number
  label: string
  gradient: string
  href: string
}) {
  return (
    <a href={href} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: 'var(--mm-surface)',
          border: '1px solid var(--mm-line)',
          borderRadius: 12,
          padding: '20px 18px',
          textAlign: 'center',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        className="hover:-translate-y-0.5 hover:shadow-lg"
      >
        <div
          className="font-[family-name:var(--font-syne)]"
          style={{
            fontSize: 56,
            fontWeight: 800,
            lineHeight: 1,
            background: gradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.02em',
          }}
        >
          {value.toLocaleString('pt-BR')}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--mm-muted)',
            marginTop: 8,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          {label}
        </div>
      </div>
    </a>
  )
}
