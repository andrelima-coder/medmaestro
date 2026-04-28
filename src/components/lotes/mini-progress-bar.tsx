'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Phase =
  | 'idle'
  | 'downloading_pdf'
  | 'rasterizing'
  | 'extracting'
  | 'classifying'
  | 'commenting'
  | 'done'
  | 'error'

type Progress = {
  phase: Phase | string
  current: number
  total: number
  message: string | null
  updated_at: string | null
} | null

type Status = 'pending' | 'extracting' | 'classifying' | 'done' | 'error'

const PHASE_SHORT: Record<string, string> = {
  idle: 'Aguardando',
  downloading_pdf: 'Baixando PDF',
  rasterizing: 'Rasterizando',
  extracting: 'Extração',
  classifying: 'Classificação',
  commenting: 'Comentários',
  done: 'Concluído',
  error: 'Erro',
}

const PHASE_COLOR: Record<string, string> = {
  idle: '#FF9800',
  downloading_pdf: '#4FC3F7',
  rasterizing: '#4FC3F7',
  extracting: '#4FC3F7',
  classifying: '#D4A843',
  commenting: '#B388FF',
  done: '#66BB6A',
  error: '#EF5350',
}

export function MiniProgressBar({
  examId,
  initialStatus,
  initialProgress,
}: {
  examId: string
  initialStatus: Status
  initialProgress: Progress
}) {
  const [status, setStatus] = useState<Status>(initialStatus)
  const [progress, setProgress] = useState<Progress>(initialProgress)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`exam-row-${examId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'exams', filter: `id=eq.${examId}` },
        (payload) => {
          const row = payload.new as { status: Status; extraction_progress: Progress }
          if (row.status) setStatus(row.status)
          if (row.extraction_progress) setProgress(row.extraction_progress)
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [examId])

  const phase = (progress?.phase as string) ?? (status === 'done' ? 'done' : status === 'error' ? 'error' : 'idle')
  const total = progress?.total ?? 0
  const current = progress?.current ?? 0
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
  const indeterminate =
    (status === 'extracting' || status === 'classifying') && total === 0
  const color = PHASE_COLOR[phase] ?? '#FF9800'
  const isActive = status === 'extracting' || status === 'classifying'

  if (status === 'done') {
    return (
      <span style={{ fontSize: 11, color: '#66BB6A', fontWeight: 600 }}>
        ✓ Concluído
      </span>
    )
  }

  if (status === 'error') {
    const msg = progress?.message ?? 'Falha no pipeline'
    return (
      <span
        title={msg}
        style={{
          fontSize: 11,
          color: '#EF5350',
          fontWeight: 600,
          maxWidth: 220,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'inline-block',
          verticalAlign: 'middle',
        }}
      >
        ⚠ {msg}
      </span>
    )
  }

  if (status === 'pending') {
    return (
      <span style={{ fontSize: 11, color: '#FF9800', fontWeight: 600 }}>
        Aguardando início
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180, maxWidth: 240 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--mm-muted)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {isActive && (
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: color,
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          )}
          <span style={{ color: 'var(--mm-text2)', fontWeight: 600 }}>
            {PHASE_SHORT[phase] ?? phase}
          </span>
        </span>
        <span>{indeterminate ? '…' : `${current}/${total} · ${pct}%`}</span>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: 'var(--mm-bg2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: 2,
            background: `linear-gradient(90deg, ${color}, ${color}80)`,
            width: indeterminate ? '100%' : `${pct}%`,
            animation: indeterminate ? 'indeterminate 2s ease-in-out infinite' : 'none',
            transition: 'width 500ms ease',
          }}
        />
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
