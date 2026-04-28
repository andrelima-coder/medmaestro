import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { RetriggerButton } from '@/components/lotes/retrigger-button'
import { MiniProgressBar } from '@/components/lotes/mini-progress-bar'

export const metadata = { title: 'Lotes — MedMaestro' }

const STATUS_LABELS: Record<string, string> = {
  pending: 'Aguardando',
  extracting: 'Extraindo',
  classifying: 'Classificando',
  done: 'Concluído',
  error: 'Erro',
}

function StatusBadge({ status }: { status: string }) {
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
        padding: '3px 10px',
        borderRadius: 20,
        display: 'inline-block',
        letterSpacing: '0.3px',
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export default async function LotesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: exams } = await service
    .from('exams')
    .select('id, year, booklet_color, status, extraction_progress, created_at, exam_boards(name, short_name), specialties(name)')
    .order('created_at', { ascending: false })

  // Busca count de questões para cada exam
  const examIds = (exams ?? []).map((e) => e.id as string)
  const questionCounts: Record<string, number> = {}
  if (examIds.length > 0) {
    const { data: qtCounts } = await service
      .from('questions')
      .select('exam_id')
      .in('exam_id', examIds)
    for (const row of qtCounts ?? []) {
      const eid = row.exam_id as string
      questionCounts[eid] = (questionCounts[eid] ?? 0) + 1
    }
  }

  const allExams = exams ?? []
  const statsDone = allExams.filter((e) => e.status === 'done').length
  const statsProcessing = allExams.filter(
    (e) => e.status === 'extracting' || e.status === 'classifying'
  ).length
  const statsError = allExams.filter((e) => e.status === 'error').length
  const statsPending = allExams.filter((e) => e.status === 'pending').length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1
            className="font-[family-name:var(--font-syne)]"
            style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
          >
            Lotes
          </h1>
          <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
            Provas enviadas para extração
          </p>
        </div>
        <Link
          href="/lotes/novo"
          style={{
            background: 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))',
            color: '#0a0a0a',
            fontFamily: 'var(--font-syne)',
            fontSize: 12,
            fontWeight: 700,
            padding: '10px 20px',
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

      {/* Stats */}
      {allExams.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Concluídos', value: statsDone, color: '#66BB6A' },
            { label: 'Em processo', value: statsProcessing, color: '#4FC3F7' },
            { label: 'Pendentes', value: statsPending, color: '#FF9800' },
            { label: 'Com erro', value: statsError, color: '#EF5350' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: 'var(--mm-surface)',
                border: '1px solid var(--mm-line)',
                borderRadius: 10,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span
                className="font-[family-name:var(--font-syne)]"
                style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1 }}
              >
                {s.value}
              </span>
              <span style={{ fontSize: 11, color: 'var(--mm-muted)', lineHeight: 1.3 }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tabela */}
      <div
        style={{
          background: 'var(--mm-surface)',
          border: '1px solid var(--mm-line)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {!exams || exams.length === 0 ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--mm-muted)',
              fontSize: 13,
            }}
          >
            Nenhum lote enviado ainda.{' '}
            <Link
              href="/lotes/novo"
              style={{ color: 'var(--mm-gold)', textDecoration: 'none' }}
            >
              Enviar primeiro lote →
            </Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['LOTE', 'ANO', 'BANCA', 'COR', 'QUESTÕES', 'STATUS', 'PROGRESSO', 'AÇÃO'].map((col) => (
                  <th
                    key={col}
                    style={{
                      textAlign: 'left',
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--mm-muted)',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      padding: '10px 16px',
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
                const statusKey = (exam.status as string | null) ?? 'pending'
                const eid = exam.id as string
                const qCount = questionCounts[eid] ?? 0

                return (
                  <tr
                    key={eid}
                    style={{ borderBottom: '1px solid var(--mm-line)' }}
                  >
                    <td style={{ fontSize: 12, padding: '11px 16px', color: 'var(--mm-text2)' }}>
                      <Link
                        href={`/lotes/${eid}`}
                        style={{ color: 'var(--mm-text)', textDecoration: 'none', fontWeight: 600 }}
                      >
                        {specialty?.name ?? '—'}
                      </Link>
                    </td>
                    <td style={{ fontSize: 12, padding: '11px 16px', color: 'var(--mm-text2)' }}>
                      {exam.year as number}
                    </td>
                    <td style={{ fontSize: 12, padding: '11px 16px', color: 'var(--mm-text2)' }}>
                      {board?.short_name ?? '—'}
                    </td>
                    <td
                      style={{
                        fontSize: 12,
                        padding: '11px 16px',
                        color: 'var(--mm-text2)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {(exam.booklet_color as string | null) ?? '—'}
                    </td>
                    <td style={{ fontSize: 12, padding: '11px 16px', color: 'var(--mm-text2)' }}>
                      {qCount}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <StatusBadge status={statusKey} />
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <MiniProgressBar
                        examId={eid}
                        initialStatus={statusKey as 'pending' | 'extracting' | 'classifying' | 'done' | 'error'}
                        initialProgress={
                          (exam.extraction_progress as {
                            phase: string
                            current: number
                            total: number
                            message: string | null
                            updated_at: string | null
                          } | null) ?? null
                        }
                      />
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Link
                          href={`/lotes/${eid}`}
                          style={{
                            fontSize: 11,
                            color: 'var(--mm-text2)',
                            border: '1px solid var(--mm-line2)',
                            borderRadius: 6,
                            padding: '4px 10px',
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                        >
                          Ver →
                        </Link>
                        {statusKey === 'done' && (
                          <Link
                            href={`/revisao?exam_id=${eid}`}
                            style={{
                              fontSize: 11,
                              color: 'var(--mm-gold)',
                              border: '1px solid var(--mm-gold-border)',
                              borderRadius: 6,
                              padding: '4px 10px',
                              textDecoration: 'none',
                              fontWeight: 600,
                              background: 'var(--mm-gold-bg)',
                            }}
                          >
                            Revisar →
                          </Link>
                        )}
                        {(statusKey === 'error' || statusKey === 'pending') && (
                          <RetriggerButton examId={eid} />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
