import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Fila de Revisão — MedMaestro' }

type SearchParams = {
  status?: string
  exam_id?: string
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; border: string }
> = {
  extracted: {
    label: 'Extraída',
    bg: 'rgba(79,195,247,0.1)',
    color: '#4FC3F7',
    border: 'rgba(79,195,247,0.25)',
  },
  reviewing: {
    label: 'Em revisão',
    bg: 'var(--mm-gold-bg)',
    color: 'var(--mm-gold)',
    border: 'var(--mm-gold-border)',
  },
  approved: {
    label: 'Aprovada',
    bg: 'rgba(102,187,106,0.1)',
    color: '#66BB6A',
    border: 'rgba(102,187,106,0.25)',
  },
  rejected: {
    label: 'Rejeitada',
    bg: 'rgba(239,83,80,0.1)',
    color: '#EF5350',
    border: 'rgba(239,83,80,0.25)',
  },
  flagged: {
    label: 'Sinalizada',
    bg: 'rgba(239,83,80,0.1)',
    color: '#EF5350',
    border: 'rgba(239,83,80,0.25)',
  },
  commented: {
    label: 'Comentada',
    bg: 'rgba(167,139,250,0.1)',
    color: '#A78BFA',
    border: 'rgba(167,139,250,0.25)',
  },
  published: {
    label: 'Publicada',
    bg: 'rgba(102,187,106,0.15)',
    color: '#66BB6A',
    border: 'rgba(102,187,106,0.3)',
  },
  draft: {
    label: 'Rascunho',
    bg: 'rgba(148,163,184,0.1)',
    color: '#94A3B8',
    border: 'rgba(148,163,184,0.25)',
  },
}

const STATUS_DOT: Record<string, string> = {
  extracted: '#4FC3F7',
  reviewing: '#D4A843',
  approved: '#66BB6A',
  rejected: '#EF5350',
  flagged: '#EF5350',
  commented: '#A78BFA',
  published: '#66BB6A',
  draft: '#94A3B8',
}

const FILTER_TABS = [
  { key: '', label: 'Todas' },
  { key: 'approved', label: 'Validadas' },
  { key: 'extracted,reviewing', label: 'Pendentes' },
  { key: 'flagged', label: 'Com erro' },
]

function buildUrl(current: SearchParams, newStatus: string): string {
  const p = new URLSearchParams()
  if (newStatus) p.set('status', newStatus)
  if (current.exam_id) p.set('exam_id', current.exam_id)
  return `/revisao${p.toString() ? '?' + p.toString() : ''}`
}

export default async function RevisaoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const statusFilter = params.status ?? ''
  const examIdFilter = params.exam_id ?? ''

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const service = createServiceClient()

  // Monta query base
  let query = service
    .from('questions')
    .select(
      'id, question_number, stem, status, has_images, extraction_confidence, exam_id, exams!inner(id, year, booklet_color, exam_boards(short_name), specialties(name)), review_assignments(assigned_to, expires_at, status)'
    )
    .order('question_number', { ascending: true })

  // Filtro de status
  if (statusFilter && statusFilter.includes(',')) {
    query = query.in('status', statusFilter.split(','))
  } else if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  if (examIdFilter) {
    query = query.eq('exam_id', examIdFilter)
  }

  const { data: allQuestionsForCount } = await service
    .from('questions')
    .select('status')

  const allQ = allQuestionsForCount ?? []

  // Contagens para sidebar
  const countByStatus = (keys: string[]) =>
    allQ.filter((q) => keys.includes(q.status as string)).length
  const totalAll = allQ.length
  const totalApproved = countByStatus(['approved'])
  const totalPending = countByStatus(['extracted', 'reviewing'])
  const totalError = countByStatus(['flagged'])

  const { data: questions } = await query.limit(100)

  // Resolve nomes dos revisores
  const reviewerIds = [
    ...new Set(
      (questions ?? [])
        .flatMap((q) => {
          const ra = q.review_assignments as unknown as
            | { assigned_to: string; expires_at: string; status: string }[]
            | null
          return ra?.map((r) => r.assigned_to) ?? []
        })
        .filter(Boolean) as string[]
    ),
  ]

  const profileMap: Record<string, string> = {}
  if (reviewerIds.length > 0) {
    const { data: profiles } = await service
      .from('profiles')
      .select('id, full_name, email')
      .in('id', reviewerIds)
    for (const p of profiles ?? []) {
      profileMap[p.id] = (p.full_name as string | null) ?? (p.email as string | null) ?? 'Revisor'
    }
  }

  const now = new Date()
  const total = (questions ?? []).length

  return (
    <div className="flex gap-0" style={{ minHeight: '100%' }}>
      {/* Sidebar 260px */}
      <div
        style={{
          width: 260,
          flexShrink: 0,
          background: 'var(--mm-bg2)',
          borderRight: '1px solid var(--mm-line)',
          padding: '20px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {/* Título sidebar */}
        <div style={{ padding: '0 16px 16px' }}>
          <span
            className="font-[family-name:var(--font-syne)]"
            style={{ fontSize: 13, fontWeight: 700, color: 'var(--mm-text)' }}
          >
            Revisão
          </span>
        </div>

        {/* Filtros de status */}
        <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            { key: '', label: 'Todas', count: totalAll },
            { key: 'approved', label: 'Validadas', count: totalApproved },
            { key: 'extracted,reviewing', label: 'Pendentes', count: totalPending },
            { key: 'flagged', label: 'Com erro', count: totalError },
          ].map((tab) => {
            const isActive = statusFilter === tab.key
            return (
              <Link
                key={tab.key}
                href={buildUrl(params, tab.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 10px',
                  borderRadius: 8,
                  textDecoration: 'none',
                  background: isActive ? 'var(--mm-gold-bg)' : 'transparent',
                  border: isActive ? '1px solid var(--mm-gold-border)' : '1px solid transparent',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: isActive ? 'var(--mm-gold)' : 'var(--mm-text2)',
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {tab.label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: isActive ? 'var(--mm-gold)' : 'var(--mm-muted)',
                    background: isActive ? 'var(--mm-gold-bg)' : 'var(--mm-line)',
                    padding: '1px 6px',
                    borderRadius: 10,
                  }}
                >
                  {tab.count}
                </span>
              </Link>
            )
          })}
        </div>

        {/* Divisor */}
        <div
          style={{
            margin: '12px 16px',
            height: 1,
            background: 'var(--mm-line)',
          }}
        />

        {/* Lista de questões */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '0 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {(questions ?? []).slice(0, 40).map((q) => {
            const statusKey = (q.status as string) ?? 'extracted'
            const dotColor = STATUS_DOT[statusKey] ?? '#5A6880'
            return (
              <Link
                key={q.id as string}
                href={`/revisao/${q.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 8,
                  textDecoration: 'none',
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--mm-text2)' }}>
                  Q{q.question_number as number}
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: '20px 24px', overflow: 'auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <div>
            <h1
              className="font-[family-name:var(--font-syne)]"
              style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
            >
              Fila de Revisão
            </h1>
            <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
              {total === 0
                ? 'Nenhuma questão'
                : `${total} questão${total !== 1 ? 'ões' : ''}`}
              {statusFilter ? ` · filtro ativo` : ''}
            </p>
          </div>
        </div>

        {/* Filtro chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {FILTER_TABS.map((tab) => {
            const isActive = statusFilter === tab.key
            return (
              <Link
                key={tab.key}
                href={buildUrl(params, tab.key)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 20,
                  fontSize: 11,
                  textDecoration: 'none',
                  border: isActive
                    ? '1px solid var(--mm-gold-border)'
                    : '1px solid var(--mm-line2)',
                  background: isActive ? 'var(--mm-gold-bg)' : 'transparent',
                  color: isActive ? 'var(--mm-gold)' : 'var(--mm-text2)',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>

        {/* Tabela */}
        {total === 0 ? (
          <div
            style={{
              background: 'var(--mm-surface)',
              border: '1px solid var(--mm-line)',
              borderRadius: 12,
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--mm-muted)',
              fontSize: 13,
            }}
          >
            Nenhuma questão encontrada com este filtro.
          </div>
        ) : (
          <div
            style={{
              background: 'var(--mm-surface)',
              border: '1px solid var(--mm-line)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Q#', 'ENUNCIADO', 'EXAME', 'STATUS', 'IMG', 'CONFIANÇA', 'REVISOR', ''].map(
                    (col) => (
                      <th
                        key={col}
                        style={{
                          textAlign: 'left',
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'var(--mm-muted)',
                          letterSpacing: '0.5px',
                          textTransform: 'uppercase',
                          padding: '10px 12px',
                          borderBottom: '1px solid var(--mm-line2)',
                        }}
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {(questions ?? []).map((q) => {
                  const exam = q.exams as unknown as {
                    id: string
                    year: number
                    booklet_color: string | null
                    exam_boards: { short_name: string } | null
                    specialties: { name: string } | null
                  } | null
                  const ra = q.review_assignments as unknown as
                    | { assigned_to: string; expires_at: string; status: string }[]
                    | null
                  const assignment = ra?.[0] ?? null
                  const isLocked =
                    assignment?.status === 'in_progress' &&
                    new Date(assignment.expires_at) > now &&
                    assignment.assigned_to !== user?.id
                  const reviewerName = assignment
                    ? (profileMap[assignment.assigned_to] ?? 'Revisor')
                    : null

                  const statusKey = (q.status as string) ?? 'extracted'
                  const sc = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.extracted
                  const conf = q.extraction_confidence as number | null
                  const confPct = conf != null ? `${conf * 20}%` : '—'
                  const stem = ((q.stem as string | null) ?? '').slice(0, 70)

                  return (
                    <tr
                      key={q.id as string}
                      style={{ borderBottom: '1px solid var(--mm-line)' }}
                    >
                      <td
                        style={{
                          padding: '10px 12px',
                          fontFamily: 'var(--font-syne)',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--mm-gold)',
                        }}
                      >
                        Q{q.question_number as number}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          fontSize: 12,
                          color: 'var(--mm-text2)',
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {stem || '—'}
                        {(q.stem as string | null)?.length ?? 0 > 70 ? '…' : ''}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          fontSize: 11,
                          color: 'var(--mm-muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {exam?.exam_boards?.short_name ?? '—'}
                        {exam ? ` ${exam.year}` : ''}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            background: sc.bg,
                            color: sc.color,
                            border: `1px solid ${sc.border}`,
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 20,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {sc.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {(q.has_images as boolean | null) ? (
                          <span
                            title="Contém imagem"
                            style={{ color: '#AB47BC', fontSize: 12 }}
                          >
                            ⬛
                          </span>
                        ) : (
                          <span style={{ color: 'var(--mm-line2)' }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          fontSize: 12,
                          color: 'var(--mm-text2)',
                        }}
                      >
                        {confPct}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          fontSize: 11,
                          color: 'var(--mm-muted)',
                        }}
                      >
                        {isLocked && reviewerName ? reviewerName : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {isLocked ? (
                          <span style={{ fontSize: 11, color: 'var(--mm-muted)' }}>
                            Em revisão
                          </span>
                        ) : (
                          <Link
                            href={`/revisao/${q.id}`}
                            style={{
                              fontSize: 11,
                              color: 'var(--mm-gold)',
                              textDecoration: 'none',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Revisar →
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
