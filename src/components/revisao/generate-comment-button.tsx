'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { generateAiComment, COMMENT_MODEL_OPTIONS } from '@/app/(dashboard)/questoes/[id]/comment-actions'

/**
 * Botão "Gerar comentário" com escolha de modelo de IA (Sonnet / Opus / Haiku).
 * Cada geração cria um NOVO comentário — o professor pode comparar as saídas de
 * modelos diferentes na mesma questão e manter/editar a melhor.
 */
export function GenerateCommentButton({ questionId }: { questionId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busyModel, setBusyModel] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  async function run(model: (typeof COMMENT_MODEL_OPTIONS)[number]['key'], label: string) {
    setOpen(false)
    setBusyModel(model)
    setFeedback(null)
    const res = await generateAiComment(questionId, model)
    setBusyModel(null)
    if (res.ok) {
      setFeedback({ ok: true, msg: `Comentário gerado com ${label}.` })
      router.refresh()
      setTimeout(() => setFeedback(null), 4000)
    } else {
      setFeedback({ ok: false, msg: res.error ?? 'Falha ao gerar comentário' })
      setTimeout(() => setFeedback(null), 6000)
    }
  }

  const busy = busyModel !== null

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid rgba(32,105,115,0.3)',
          background: 'rgba(32,105,115,0.08)',
          color: '#206973',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? 'Gerando…' : '✨ Gerar comentário'}
        {!busy && <span style={{ fontSize: 9 }}>▾</span>}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            zIndex: 30,
            minWidth: 230,
            background: '#FFFFFF',
            border: '1px solid rgba(14,40,65,0.08)',
            borderRadius: 10,
            boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 12px', fontSize: 10, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#5F7288', borderBottom: '1px solid rgba(14,40,65,0.06)' }}>
            Escolha o modelo de IA
          </div>
          {COMMENT_MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => run(opt.key, opt.label)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '9px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(14,40,65,0.04)',
                cursor: 'pointer',
                color: '#0E2841',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(14,40,65,0.04)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</div>
              <div style={{ fontSize: 10.5, color: '#5F7288', marginTop: 1 }}>{opt.hint}</div>
            </button>
          ))}
        </div>
      )}

      {feedback && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            zIndex: 20,
            minWidth: 220,
            fontSize: 11,
            padding: '8px 12px',
            borderRadius: 8,
            background: feedback.ok ? 'rgba(0,96,72,0.1)' : 'rgba(211,64,42,0.1)',
            border: `1px solid ${feedback.ok ? 'rgba(0,96,72,0.3)' : 'rgba(211,64,42,0.3)'}`,
            color: feedback.ok ? '#006048' : '#D3402A',
          }}
        >
          {feedback.msg}
        </div>
      )}
    </div>
  )
}
