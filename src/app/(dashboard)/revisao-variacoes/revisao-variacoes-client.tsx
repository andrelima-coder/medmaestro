'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  approveVariationAction,
  promoteVariationAction,
  rejectVariationAction,
  type PendingVariation,
} from '../variacoes/actions'

const DELTA_LABEL: Record<number, string> = {
  0: 'Mesma dificuldade',
  1: '+1 nível',
  2: '+2 níveis',
}

export function RevisaoVariacoesClient({
  variations,
}: {
  variations: PendingVariation[]
}) {
  const router = useRouter()
  const [idx, setIdx] = useState(0)
  const [showSource, setShowSource] = useState(false)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  const v = variations[idx]
  const total = variations.length

  function next() {
    setShowSource(false)
    setFeedback(null)
    if (idx + 1 >= total) router.refresh()
    else setIdx(idx + 1)
  }

  function approve() {
    if (!v || pending) return
    startTransition(async () => {
      await approveVariationAction(v.id)
      next()
    })
  }

  function promote() {
    if (!v || pending) return
    startTransition(async () => {
      const res = await promoteVariationAction(v.id)
      if (res.ok) {
        setFeedback(`✓ Promovida ao banco (Q${res.questionId?.slice(0, 8)})`)
        setTimeout(next, 600)
      } else {
        setFeedback(`Erro: ${res.error}`)
      }
    })
  }

  function reject() {
    if (!v || pending) return
    startTransition(async () => {
      await rejectVariationAction(v.id)
      next()
    })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'A') approve()
      else if (e.key === 'p' || e.key === 'P') promote()
      else if (e.key === 'd' || e.key === 'D') reject()
      else if (e.key === 's' || e.key === 'S') setShowSource((s) => !s)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, pending])

  if (!v) {
    return (
      <div
        style={{
          background: 'var(--mm-surface)',
          border: '1px solid var(--mm-line)',
          borderRadius: 12,
          padding: 40,
          textAlign: 'center',
          color: 'var(--mm-muted)',
          fontSize: 13,
        }}
      >
        Todas as variações revisadas. Recarregando…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        style={{
          fontSize: 11,
          color: 'var(--mm-muted)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>
          Variação {idx + 1} / {total} · {v.exam_label}
          {v.source_question_number != null &&
            ` · derivada de Q${v.source_question_number}`}
        </span>
        <span>
          {DELTA_LABEL[v.difficulty_delta] ?? `Δ ${v.difficulty_delta}`}
        </span>
      </div>

      {/* Variação */}
      <div
        style={{
          background: 'var(--mm-surface)',
          border: '1px solid var(--mm-line)',
          borderRadius: 12,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div>
          <div style={labelStyle}>Variação — Enunciado</div>
          <div style={contentStyle}>{v.stem}</div>
        </div>

        <div>
          <div style={labelStyle}>Alternativas</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(['A', 'B', 'C', 'D', 'E'] as const).map((letter) => {
              const text = v.alternatives[letter] ?? ''
              if (!text) return null
              const isCorrect = v.correct_answer === letter
              return (
                <li
                  key={letter}
                  style={{
                    fontSize: 13,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: isCorrect ? 'rgba(102,187,106,0.08)' : 'transparent',
                    border: isCorrect ? '1px solid rgba(102,187,106,0.3)' : '1px solid transparent',
                    color: isCorrect ? '#66BB6A' : 'var(--mm-text2)',
                  }}
                >
                  <strong style={{ color: isCorrect ? '#66BB6A' : 'var(--mm-gold)' }}>
                    {letter})
                  </strong>{' '}
                  {text}
                </li>
              )
            })}
          </ul>
        </div>

        {v.rationale && (
          <div>
            <div style={labelStyle}>Justificativa</div>
            <div style={{ ...contentStyle, fontSize: 13, color: 'var(--mm-muted)' }}>
              {v.rationale}
            </div>
          </div>
        )}
      </div>

      {/* Original (toggle) */}
      <button
        onClick={() => setShowSource((s) => !s)}
        style={btnGhost}
      >
        {showSource ? 'Ocultar' : 'Ver'} questão original (S)
      </button>

      {showSource && (
        <div
          style={{
            background: 'var(--mm-bg2)',
            border: '1px solid var(--mm-line2)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={labelStyle}>
            Original — Q{v.source_question_number ?? '?'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--mm-muted)', lineHeight: 1.5 }}>
            {v.source_stem}…
          </div>
        </div>
      )}

      {/* Ações */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={approve} disabled={pending} style={btnSuccess(!pending)}>
          Aprovar (A)
        </button>
        <button onClick={promote} disabled={pending} style={btnPromote(!pending)}>
          Promover ao banco (P)
        </button>
        <button onClick={reject} disabled={pending} style={btnDanger(!pending)}>
          Descartar (D)
        </button>
      </div>

      {feedback && (
        <div
          style={{
            fontSize: 11,
            textAlign: 'center',
            color: feedback.startsWith('Erro') ? '#EF5350' : '#66BB6A',
          }}
        >
          {feedback}
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--mm-muted)',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  marginBottom: 8,
}

const contentStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--mm-text)',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
}

const btnBase: React.CSSProperties = {
  fontFamily: 'var(--font-syne)',
  fontSize: 12,
  fontWeight: 700,
  padding: '10px 20px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
}

function btnSuccess(active: boolean): React.CSSProperties {
  return {
    ...btnBase,
    background: active ? '#66BB6A' : 'var(--mm-bg2)',
    color: active ? '#0a0a0a' : 'var(--mm-muted)',
    cursor: active ? 'pointer' : 'default',
  }
}

function btnPromote(active: boolean): React.CSSProperties {
  return {
    ...btnBase,
    background: active
      ? 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))'
      : 'var(--mm-bg2)',
    color: active ? '#0a0a0a' : 'var(--mm-muted)',
    cursor: active ? 'pointer' : 'default',
  }
}

function btnDanger(active: boolean): React.CSSProperties {
  return {
    ...btnBase,
    background: active ? 'rgba(239,83,80,0.15)' : 'var(--mm-bg2)',
    color: active ? '#EF5350' : 'var(--mm-muted)',
    border: active ? '1px solid rgba(239,83,80,0.4)' : '1px solid var(--mm-line2)',
    cursor: active ? 'pointer' : 'default',
  }
}

const btnGhost: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--mm-text2)',
  border: '1px solid var(--mm-line2)',
  fontSize: 11,
  fontWeight: 600,
  padding: '6px 12px',
  borderRadius: 8,
  cursor: 'pointer',
  alignSelf: 'flex-start',
}
