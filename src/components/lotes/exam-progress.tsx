'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { triggerExtractionAction } from '@/app/(dashboard)/lotes/[id]/extract-action'

type ExamStatus = 'pending' | 'extracting' | 'classifying' | 'done' | 'error'

type ExtractionProgress = {
  phase: string
  current: number
  total: number
  message: string | null
  updated_at: string | null
} | null

type Exam = {
  id: string
  status: ExamStatus
  year: number
  booklet_color: string | null
  specialties: { name: string } | null
  extraction_progress?: ExtractionProgress
}

const PHASE_LABEL: Record<string, string> = {
  idle: 'Aguardando início',
  downloading_pdf: 'Baixando PDF',
  rasterizing: 'Convertendo PDF em imagens',
  extracting: 'Extraindo questões (Claude Vision)',
  classifying: 'Classificando por IA',
  commenting: 'Gerando comentários didáticos',
  done: 'Concluído',
  error: 'Erro',
}

const STATUS_LABELS: Record<ExamStatus, string> = {
  pending: 'Aguardando',
  extracting: 'Extraindo',
  classifying: 'Classificando',
  done: 'Concluído',
  error: 'Erro',
}

const STATUS_STYLES: Record<ExamStatus, { bg: string; color: string; border: string }> = {
  pending: {
    bg: 'rgba(255,152,0,0.1)',
    color: '#FF9800',
    border: 'rgba(255,152,0,0.25)',
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
  done: {
    bg: 'rgba(102,187,106,0.1)',
    color: '#66BB6A',
    border: 'rgba(102,187,106,0.25)',
  },
  error: {
    bg: 'rgba(239,83,80,0.1)',
    color: '#EF5350',
    border: 'rgba(239,83,80,0.25)',
  },
}

const PHASE_LABELS: Partial<Record<ExamStatus, string>> = {
  extracting: 'Claude Vision lendo o PDF e extraindo enunciados e alternativas…',
  classifying: 'Claude Sonnet classificando as questões por módulo e tema…',
}

export function ExamProgress({
  exam,
  initialCount,
}: {
  exam: Exam
  initialCount: number
}) {
  const [status, setStatus] = useState<ExamStatus>(exam.status)
  const [count, setCount] = useState(initialCount)
  const [classifiedCount, setClassifiedCount] = useState(0)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [progress, setProgress] = useState<ExtractionProgress>(
    exam.extraction_progress ?? null
  )
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function triggerExtraction() {
    setTriggering(true)
    setExtractError(null)
    const data = await triggerExtractionAction(exam.id)
    if (!data.ok) setExtractError(data.error ?? 'Erro desconhecido')
    setTriggering(false)
  }

  // Auto-dispara extração quando o exame está pending
  useEffect(() => {
    if (exam.status === 'pending') {
      triggerExtraction()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Supabase Realtime — escuta mudanças de status e progresso no exame
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`exam-${exam.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'exams', filter: `id=eq.${exam.id}` },
        (payload) => {
          const row = payload.new as {
            status: ExamStatus
            extraction_progress: ExtractionProgress
          }
          setStatus(row.status)
          if (row.extraction_progress) setProgress(row.extraction_progress)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [exam.id])

  // Poll do count de questões e tags durante extração e classificação
  useEffect(() => {
    const isActive = status === 'extracting' || status === 'classifying'
    if (!isActive) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    const supabase = createClient()
    pollRef.current = setInterval(async () => {
      const [questionsRes, classifiedRes] = await Promise.all([
        supabase
          .from('questions')
          .select('*', { count: 'exact', head: true })
          .eq('exam_id', exam.id),
        supabase
          .from('questions')
          .select('question_tags!inner(question_id)', { count: 'exact', head: true })
          .eq('exam_id', exam.id),
      ])

      if (questionsRes.count !== null) setCount(questionsRes.count)
      if (classifiedRes.count !== null) setClassifiedCount(classifiedRes.count)
    }, 3000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [status, exam.id])

  const ss = STATUS_STYLES[status]
  const phaseLabel = PHASE_LABELS[status]

  return (
    <div
      style={{
        background: 'var(--mm-surface)',
        border: '1px solid var(--mm-line)',
        borderRadius: 12,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 12, color: 'var(--mm-muted)', marginBottom: 4 }}>
            {exam.specialties?.name ?? 'Especialidade'} · {exam.year}
            {exam.booklet_color
              ? ` · ${exam.booklet_color.charAt(0).toUpperCase() + exam.booklet_color.slice(1)}`
              : ''}
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              className="font-[family-name:var(--font-syne)]"
              style={{ fontSize: 32, fontWeight: 800, color: 'var(--mm-text)', lineHeight: 1 }}
            >
              {count}
            </span>
            <span style={{ fontSize: 12, color: 'var(--mm-muted)' }}>questões extraídas</span>
          </div>
          {status === 'classifying' && count > 0 && (
            <p style={{ fontSize: 11, color: 'var(--mm-muted)', marginTop: 4 }}>
              {classifiedCount}/{count} classificadas
            </p>
          )}
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
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            flexShrink: 0,
          }}
        >
          {(status === 'extracting' || status === 'classifying') && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: ss.color,
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          )}
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* Progress bar detalhada (durante pipeline) */}
      {(status === 'extracting' || status === 'classifying') && (
        <div>
          {(() => {
            const phase = progress?.phase ?? 'idle'
            const total = progress?.total ?? 0
            const current = progress?.current ?? 0
            const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
            const phaseLbl = PHASE_LABEL[phase] ?? phaseLabel ?? 'Processando…'
            const indeterminate = total === 0
            return (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: 'var(--mm-muted)',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ color: 'var(--mm-text2)', fontWeight: 600 }}>{phaseLbl}</span>
                  <span>
                    {indeterminate ? '…' : `${current}/${total} · ${pct}%`}
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: 'var(--mm-bg2)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 3,
                      background: `linear-gradient(90deg, ${ss.color}, ${ss.color}80)`,
                      width: indeterminate ? '100%' : `${pct}%`,
                      animation: indeterminate ? 'indeterminate 2s ease-in-out infinite' : 'none',
                      transition: 'width 500ms ease',
                    }}
                  />
                </div>
                {progress?.message && (
                  <p style={{ fontSize: 11, color: 'var(--mm-muted)', marginTop: 8 }}>
                    {progress.message}
                  </p>
                )}
              </>
            )
          })()}
        </div>
      )}

      {/* Erro */}
      {extractError && (
        <div
          style={{
            borderRadius: 8,
            border: '1px solid rgba(239,83,80,0.25)',
            background: 'rgba(239,83,80,0.08)',
            padding: '10px 14px',
            fontSize: 12,
            color: '#EF5350',
          }}
        >
          {extractError}
        </div>
      )}

      {/* Ações */}
      <div style={{ display: 'flex', gap: 8 }}>
        {status === 'done' && (
          <Button render={<a href={`/questoes?exam_id=${exam.id}`} />}>Ver questões →</Button>
        )}
        {(status === 'error' || (status !== 'extracting' && status !== 'classifying' && extractError)) && (
          <Button variant="outline" onClick={triggerExtraction} disabled={triggering}>
            {triggering ? 'Iniciando…' : 'Tentar novamente'}
          </Button>
        )}
        <Button variant="ghost" render={<a href="/lotes" />}>Voltar aos lotes</Button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        @keyframes indeterminate {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  )
}
