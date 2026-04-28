import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { ExamProgress } from '@/components/lotes/exam-progress'

export const metadata = { title: 'Lote — MedMaestro' }

function StatCard({
  value,
  label,
  color,
}: {
  value: number
  label: string
  color: string
}) {
  return (
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
  )
}

export default async function LotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [examRes, questionsRes, jobsRes] = await Promise.all([
    supabase
      .from('exams')
      .select('id, year, booklet_color, status, extraction_progress, exam_boards(name, short_name), specialties(name)')
      .eq('id', id)
      .single(),
    supabase
      .from('questions')
      .select('id, status, extraction_confidence, question_number, stem')
      .eq('exam_id', id),
    supabase
      .from('jobs')
      .select('id, type, status')
      .eq('exam_id', id),
  ])

  const exam = examRes.data
  if (!exam) notFound()

  const questions = questionsRes.data ?? []
  const jobs = jobsRes.data ?? []

  const totalQuestoes = questions.length

  // Stats
  const extraidasOk = questions.filter(
    (q) => q.status !== 'pending_extraction' && (q.extraction_confidence as number | null) !== null
  ).length
  const baixaConfianca = questions.filter(
    (q) => (q.extraction_confidence as number | null) !== null && (q.extraction_confidence as number) <= 2
  ).length
  const comErro = questions.filter(
    (q) => q.status === 'needs_attention' || q.status === 'error'
  ).length
  const progresso =
    totalQuestoes > 0 ? Math.round((extraidasOk / totalQuestoes) * 100) : 0

  // Questões com alerta
  const alertQuestions = questions.filter(
    (q) =>
      q.status === 'needs_attention' ||
      ((q.extraction_confidence as number | null) !== null &&
        (q.extraction_confidence as number) <= 2)
  )

  // Progresso dos steps via jobs
  const jobByType = (type: string, status: string) =>
    jobs.filter((j) => j.type === type && j.status === status).length
  const jobTotalByType = (type: string) => jobs.filter((j) => j.type === type).length

  function stepProgress(type: string): number {
    const total = jobTotalByType(type)
    if (total === 0) return 0
    const done = jobByType(type, 'completed')
    return Math.round((done / total) * 100)
  }

  const specialty = exam.specialties as unknown as { name: string } | null
  const board = exam.exam_boards as unknown as { name: string; short_name: string } | null
  const statusKey = (exam.status as string) ?? 'pending'

  const STATUS_LABELS: Record<string, string> = {
    pending: 'Aguardando',
    extracting: 'Extraindo',
    classifying: 'Classificando',
    done: 'Concluído',
    error: 'Erro',
  }

  const statusStyles: Record<string, { bg: string; color: string; border: string }> = {
    done: { bg: 'rgba(102,187,106,0.1)', color: '#66BB6A', border: 'rgba(102,187,106,0.25)' },
    extracting: { bg: 'rgba(79,195,247,0.1)', color: '#4FC3F7', border: 'rgba(79,195,247,0.25)' },
    classifying: {
      bg: 'var(--mm-gold-bg)',
      color: 'var(--mm-gold)',
      border: 'var(--mm-gold-border)',
    },
    pending: { bg: 'rgba(255,152,0,0.1)', color: '#FF9800', border: 'rgba(255,152,0,0.25)' },
    error: { bg: 'rgba(239,83,80,0.1)', color: '#EF5350', border: 'rgba(239,83,80,0.25)' },
  }
  const ss = statusStyles[statusKey] ?? statusStyles.pending

  const steps = [
    { label: 'Parse do gabarito', type: 'parse_answer_key' },
    { label: 'Extração de questões', type: 'extract_questions' },
    { label: 'Classificação por IA', type: 'classify_questions' },
    { label: 'Geração de comentários', type: 'generate_comments' },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link
              href="/lotes"
              style={{ fontSize: 12, color: 'var(--mm-muted)', textDecoration: 'none' }}
            >
              ← Lotes
            </Link>
          </div>
          <h1
            className="font-[family-name:var(--font-syne)]"
            style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text)' }}
          >
            {specialty?.name ?? 'Exame'} {exam.year as number}
            {exam.booklet_color
              ? ` · ${(exam.booklet_color as string).charAt(0).toUpperCase() + (exam.booklet_color as string).slice(1)}`
              : ''}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--mm-muted)', marginTop: 2 }}>
            {board?.short_name ?? ''} · Progresso da extração
          </p>
        </div>
        <span
          style={{
            background: ss.bg,
            color: ss.color,
            border: `1px solid ${ss.border}`,
            fontSize: 10,
            fontWeight: 600,
            padding: '4px 12px',
            borderRadius: 20,
          }}
        >
          {STATUS_LABELS[statusKey] ?? statusKey}
        </span>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <StatCard value={extraidasOk} label="Extraídas OK" color="var(--mm-green)" />
        <StatCard value={baixaConfianca} label="Baixa confiança" color="var(--mm-orange)" />
        <StatCard value={comErro} label="Com erro / alerta" color="var(--mm-red)" />
        <StatCard value={progresso} label="% Progresso" color="var(--mm-blue)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Progresso dos steps */}
        <div
          style={{
            background: 'var(--mm-surface)',
            border: '1px solid var(--mm-line)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <span
            className="font-[family-name:var(--font-syne)]"
            style={{ fontSize: 14, fontWeight: 700, display: 'block', marginBottom: 16 }}
          >
            Progresso da extração
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {steps.map((step) => {
              const pct = stepProgress(step.type)
              const total = jobTotalByType(step.type)
              const done = jobByType(step.type, 'completed')
              return (
                <div key={step.type}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--mm-text2)' }}>{step.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--mm-muted)' }}>
                      {total === 0 ? '—' : `${done}/${total}`}
                    </span>
                  </div>
                  <div
                    style={{
                      width: '100%',
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
                        background:
                          total === 0
                            ? 'var(--mm-line2)'
                            : 'linear-gradient(90deg, var(--mm-gold), var(--mm-gold2))',
                        width: total === 0 ? '0%' : `${pct}%`,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Realtime status + botões */}
        <ExamProgress
          exam={{
            id: exam.id as string,
            status: statusKey as 'pending' | 'extracting' | 'classifying' | 'done' | 'error',
            year: exam.year as number,
            booklet_color: exam.booklet_color as string | null,
            specialties: specialty,
            extraction_progress: (exam.extraction_progress as {
              phase: string
              current: number
              total: number
              message: string | null
              updated_at: string | null
            } | null) ?? null,
          }}
          initialCount={totalQuestoes}
        />
      </div>

      {/* Questões com alerta */}
      {alertQuestions.length > 0 && (
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
              Questões com alerta
            </span>
            <span
              style={{
                background: 'rgba(239,83,80,0.1)',
                color: '#EF5350',
                border: '1px solid rgba(239,83,80,0.25)',
                fontSize: 10,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 20,
              }}
            >
              {alertQuestions.length} questões
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Q#', 'ENUNCIADO', 'STATUS', 'CONFIANÇA', 'AÇÃO'].map((col) => (
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
              {alertQuestions.slice(0, 10).map((q) => {
                const conf = q.extraction_confidence as number | null
                const stem = ((q.stem as string | null) ?? '').slice(0, 60)
                return (
                  <tr key={q.id as string} style={{ borderBottom: '1px solid var(--mm-line)' }}>
                    <td
                      style={{
                        fontSize: 12,
                        padding: '10px 12px',
                        color: 'var(--mm-gold)',
                        fontWeight: 700,
                        fontFamily: 'var(--font-syne)',
                      }}
                    >
                      Q{q.question_number as number}
                    </td>
                    <td
                      style={{
                        fontSize: 12,
                        padding: '10px 12px',
                        color: 'var(--mm-text2)',
                        maxWidth: 240,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {stem || '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          background: 'rgba(255,152,0,0.1)',
                          color: '#FF9800',
                          border: '1px solid rgba(255,152,0,0.25)',
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 20,
                        }}
                      >
                        {q.status === 'needs_attention' ? 'Atenção' : 'Baixa confiança'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, padding: '10px 12px', color: 'var(--mm-text2)' }}>
                      {conf != null ? `${conf * 20}%` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Link
                        href={`/revisao/${q.id}`}
                        style={{
                          fontSize: 11,
                          color: 'var(--mm-gold)',
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                      >
                        Revisar →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Prosseguir */}
      {statusKey === 'done' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Link
            href={`/revisao?exam_id=${exam.id}`}
            style={{
              background: 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))',
              color: '#0a0a0a',
              fontFamily: 'var(--font-syne)',
              fontSize: 13,
              fontWeight: 700,
              padding: '12px 24px',
              borderRadius: 8,
              textDecoration: 'none',
              boxShadow: '0 4px 20px rgba(212,168,67,0.25)',
            }}
          >
            Prosseguir para revisão →
          </Link>
        </div>
      )}
    </div>
  )
}
