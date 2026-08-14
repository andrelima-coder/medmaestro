import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Fila de Revisão — MedMaestro' }

type SearchParams = {
  status?: string
  exam_id?: string
}

// Vocabulário REAL do enum question_status (ver AGENTS.md): pending_extraction,
// pending_review, in_review, pending_approval, approved, published, rejected,
// needs_attention, draft, flagged. 'extracted'/'reviewing'/'commented' NÃO existem.
const STATUS_CONFIG_DEFAULT = {
  label: '—',
  bg: 'rgba(164,163,164,0.1)',
  color: '#A4A3A4',
  border: 'rgba(164,163,164,0.25)',
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; border: string }
> = {
  pending_extraction: {
    label: 'Extraída',
    bg: 'rgba(32,105,115,0.1)',
    color: '#206973',
    border: 'rgba(32,105,115,0.25)',
  },
  pending_review: {
    label: 'Pendente',
    bg: 'var(--mm-gold-bg)',
    color: 'var(--mm-gold)',
    border: 'var(--mm-gold-border)',
  },
  in_review: {
    label: 'Em revisão',
    bg: 'var(--mm-gold-bg)',
    color: 'var(--mm-gold)',
    border: 'var(--mm-gold-border)',
  },
  pending_approval: {
    label: 'Aguardando aprovação',
    bg: 'rgba(123,63,160,0.1)',
    color: '#7B3FA0',
    border: 'rgba(123,63,160,0.25)',
  },
  needs_attention: {
    label: 'Requer atenção',
    bg: 'rgba(211,64,42,0.1)',
    color: '#D3402A',
    border: 'rgba(211,64,42,0.25)',
  },
  approved: {
    label: 'Aprovada',
    bg: 'rgba(0,96,72,0.1)',
    color: '#006048',
    border: 'rgba(0,96,72,0.25)',
  },
  rejected: {
    label: 'Rejeitada',
    bg: 'rgba(211,64,42,0.1)',
    color: '#D3402A',
    border: 'rgba(211,64,42,0.25)',
  },
  flagged: {
    label: 'Sinalizada',
    bg: 'rgba(211,64,42,0.1)',
    color: '#D3402A',
    border: 'rgba(211,64,42,0.25)',
  },
  published: {
    label: 'Publicada',
    bg: 'rgba(0,96,72,0.15)',
    color: '#006048',
    border: 'rgba(0,96,72,0.3)',
  },
  draft: {
    label: 'Rascunho',
    bg: 'rgba(164,163,164,0.1)',
    color: '#A4A3A4',
    border: 'rgba(164,163,164,0.25)',
  },
}

const STATUS_DOT: Record<string, string> = {
  pending_extraction: '#206973',
  pending_review: '#B6014F',
  in_review: '#B6014F',
  pending_approval: '#7B3FA0',
  needs_attention: '#D3402A',
  approved: '#006048',
  rejected: '#D3402A',
  flagged: '#D3402A',
  published: '#006048',
  draft: '#A4A3A4',
}

const FILTER_TABS = [
  { key: '', label: 'Todas' },
  { key: 'approved,published', label: 'Validadas' },
  { key: 'pending_review,in_review,pending_approval,needs_attention', label: 'Pendentes' },
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
  // Vocabulário REAL do enum question_status (ver pipeline.ts): extração nova
  // grava 'pending_review'; 'extracted'/'reviewing' não existem no banco.
  const totalApproved = countByStatus(['approved', 'published'])
  const totalPending = countByStatus([
    'pending_review',
    'in_review',
    'pending_approval',
    'needs_attention',
  ])
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
            { key: 'approved,published', label: 'Validadas', count: totalApproved },
            {
              key: 'pending_review,in_review,pending_approval,needs_attention',
              label: 'Pendentes',
              count: totalPending,
            },
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
            const dotColor = STATUS_DOT[statusKey] ?? '#5F7288'
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

                  const statusKey = (q.status as string) ?? 'pending_extraction'
                  const sc = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG_DEFAULT
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
                            style={{ color: '#7B3FA0', fontSize: 12 }}
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
