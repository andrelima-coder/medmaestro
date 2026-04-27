import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ROLE_LABELS } from '@/types'

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
  ] = await Promise.all([
    service.from('profiles').select('role, full_name').eq('id', user!.id).single(),
    service.from('questions').select('id', { count: 'exact', head: true }),
    service
      .from('question_tags')
      .select('question_id', { count: 'exact', head: true }),
    service
      .from('question_comments')
      .select('question_id', { count: 'exact', head: true }),
    service.from('exams').select('id', { count: 'exact', head: true }),
    service
      .from('question_tags')
      .select('question_id, tags!inner(label, color, dimension)')
      .eq('tags.dimension', 'modulo'),
    service
      .from('exams')
      .select('id, year, booklet_color, status, exam_boards(name, short_name), specialties(name)')
      .order('created_at', { ascending: false })
      .limit(8),
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
    const tag = row.tags as unknown as { label: string; color: string; dimension: string } | null
    if (!tag) continue
    moduloCount[tag.label] = (moduloCount[tag.label] ?? 0) + 1
  }

  const totalTagged = Object.values(moduloCount).reduce((s, v) => s + v, 0)

  // Merge com MODULOS para manter ordem e cores canônicas
  const modulosData = MODULOS.map((m) => ({
    ...m,
    count: moduloCount[m.label] ?? 0,
  }))

  const maxCount = Math.max(...modulosData.map((m) => m.count), 1)

  // Top 8 para incidência
  const top8 = [...modulosData]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const exams = examsTableRes.data ?? []

  const STATUS_EXAM_LABELS: Record<string, string> = {
    pending: 'Aguardando',
    extracting: 'Extraindo',
    classifying: 'Classificando',
    done: 'Concluído',
    error: 'Erro',
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1
          className="font-[family-name:var(--font-syne)] text-xl font-bold"
          style={{ color: 'var(--mm-text)' }}
        >
          Olá, {name.split(' ')[0]}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
          {roleLabel} · MedMaestro
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <StatCard
          value={totalQuestoes}
          label="Questões no banco"
          color="var(--mm-gold)"
          href="/questoes"
        />
        <StatCard
          value={classificadas}
          label="Classificadas / com tags"
          color="var(--mm-green)"
          href="/questoes"
        />
        <StatCard
          value={comentadas}
          label="Comentadas por IA"
          color="var(--mm-blue)"
          href="/questoes"
        />
        <StatCard
          value={totalLotes}
          label="Provas importadas"
          color="var(--mm-purple)"
          href="/lotes"
        />
      </div>

      {/* Cards linha 2 */}
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
              marginBottom: 16,
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
              {totalTagged} tags
            </span>
          </div>

          {/* Barras verticais */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 6,
              height: 80,
              paddingBottom: 4,
            }}
          >
            {modulosData.map((m) => {
              const pct = maxCount > 0 ? (m.count / maxCount) * 100 : 0
              return (
                <div
                  key={m.label}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
                  title={`${m.label}: ${m.count}`}
                >
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max(pct, 3)}%`,
                      background: m.color,
                      borderRadius: '3px 3px 0 0',
                      opacity: m.count === 0 ? 0.25 : 0.85,
                      minHeight: 3,
                    }}
                  />
                </div>
              )
            })}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginTop: 10,
              flexWrap: 'wrap',
            }}
          >
            {modulosData.map((m) => (
              <div
                key={m.label}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: m.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--mm-muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.label.split(' ')[0]}
                </span>
              </div>
            ))}
          </div>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {top8.map((m) => {
              const pct = totalTagged > 0 ? Math.round((m.count / totalTagged) * 100) : 0
              return (
                <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--mm-text2)',
                      width: 120,
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
                      height: 5,
                      background: 'var(--mm-bg2)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        borderRadius: 3,
                        background: m.color,
                        width: `${pct}%`,
                        opacity: 0.85,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--mm-muted)',
                      width: 30,
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    {pct}%
                  </span>
                </div>
              )
            })}
            {totalTagged === 0 && (
              <p style={{ fontSize: 12, color: 'var(--mm-muted)', textAlign: 'center', padding: '20px 0' }}>
                Nenhuma questão classificada ainda
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Lotes importados */}
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
            Lotes importados
          </span>
          <Link
            href="/lotes/novo"
            style={{
              background: 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))',
              color: '#0a0a0a',
              fontFamily: 'var(--font-syne)',
              fontSize: 12,
              fontWeight: 700,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              boxShadow: '0 4px 20px rgba(212,168,67,0.25)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            + Novo lote
          </Link>
        </div>

        {exams.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--mm-muted)', textAlign: 'center', padding: '20px 0' }}>
            Nenhum lote importado ainda.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['ESPECIALIDADE', 'ANO', 'BANCA', 'COR', 'STATUS', ''].map((col) => (
                  <th
                    key={col}
                    style={{
                      textAlign: 'left',
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--mm-muted)',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--mm-line2)',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => {
                const board = exam.exam_boards as unknown as { name: string; short_name: string } | null
                const specialty = exam.specialties as unknown as { name: string } | null
                const statusKey = (exam.status as string) ?? 'pending'

                return (
                  <tr key={exam.id as string}>
                    <td
                      style={{
                        fontSize: 12,
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--mm-line)',
                        color: 'var(--mm-text2)',
                      }}
                    >
                      {specialty?.name ?? '—'}
                    </td>
                    <td
                      style={{
                        fontSize: 12,
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--mm-line)',
                        color: 'var(--mm-text2)',
                      }}
                    >
                      {exam.year as number}
                    </td>
                    <td
                      style={{
                        fontSize: 12,
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--mm-line)',
                        color: 'var(--mm-text2)',
                      }}
                    >
                      {board?.short_name ?? '—'}
                    </td>
                    <td
                      style={{
                        fontSize: 12,
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--mm-line)',
                        color: 'var(--mm-text2)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {(exam.booklet_color as string | null) ?? '—'}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--mm-line)',
                      }}
                    >
                      <ExamStatusBadge status={statusKey} label={STATUS_EXAM_LABELS[statusKey] ?? statusKey} />
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--mm-line)',
                        textAlign: 'right',
                      }}
                    >
                      <Link
                        href={`/lotes/${exam.id}`}
                        style={{
                          fontSize: 11,
                          color: 'var(--mm-gold)',
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                      >
                        Ver →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {totalLotes > 8 && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Link
              href="/lotes"
              style={{ fontSize: 12, color: 'var(--mm-gold)', textDecoration: 'none' }}
            >
              Ver todos os {totalLotes} lotes →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  value,
  label,
  color,
  href,
}: {
  value: number
  label: string
  color: string
  href: string
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: 'var(--mm-surface)',
          border: '1px solid var(--mm-line)',
          borderRadius: 12,
          padding: 16,
          textAlign: 'center',
        }}
      >
        <div
          className="font-[family-name:var(--font-syne)]"
          style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color }}
        >
          {value.toLocaleString('pt-BR')}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--mm-muted)',
            marginTop: 4,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
      </div>
    </Link>
  )
}

function ExamStatusBadge({ status, label }: { status: string; label: string }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    done: {
      bg: 'rgba(102,187,106,0.1)',
      color: '#66BB6A',
      border: 'rgba(102,187,106,0.25)',
    },
    extracting: {
      bg: 'rgba(79,195,247,0.1)',
      color: '#4FC3F7',
      border: 'rgba(79,195,247,0.25)',
    },
    classifying: {
      bg: 'var(--mm-gold-bg)',
      color: 'var(--mm-gold)',
      border: 'var(--mm-gold-border)',
    },
    pending: {
      bg: 'rgba(255,152,0,0.1)',
      color: '#FF9800',
      border: 'rgba(255,152,0,0.25)',
    },
    error: {
      bg: 'rgba(239,83,80,0.1)',
      color: '#EF5350',
      border: 'rgba(239,83,80,0.25)',
    },
  }
  const s = styles[status] ?? styles.pending
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        fontSize: 10,
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: 20,
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  )
}
