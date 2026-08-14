'use client'

import { useState } from 'react'
import { triggerExtractionAction } from '@/app/(dashboard)/(admin)/lotes/[id]/extract-action'

export function RetriggerButton({ examId }: { examId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  async function handleClick() {
    setState('loading')
    const res = await triggerExtractionAction(examId)
    if (res.ok) {
      setState('ok')
      // Recarrega a página após 1s para mostrar status atualizado
      setTimeout(() => window.location.reload(), 1000)
    } else {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  const labels = { idle: 'Reextrair', loading: 'Iniciando…', ok: 'Iniciado ✓', error: 'Erro' }
  const colors = {
    idle: { color: '#206973', border: 'rgba(32,105,115,0.3)', bg: 'rgba(32,105,115,0.08)' },
    loading: { color: 'var(--mm-muted)', border: 'var(--mm-line2)', bg: 'transparent' },
    ok: { color: '#006048', border: 'rgba(0,96,72,0.3)', bg: 'rgba(0,96,72,0.08)' },
    error: { color: '#D3402A', border: 'rgba(211,64,42,0.3)', bg: 'rgba(211,64,42,0.08)' },
  }
  const s = colors[state]

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading' || state === 'ok'}
      style={{
        fontSize: 11,
        color: s.color,
        border: `1px solid ${s.border}`,
        borderRadius: 6,
        padding: '4px 10px',
        fontWeight: 600,
        background: s.bg,
        cursor: state === 'idle' ? 'pointer' : 'default',
        transition: 'all 0.15s',
      }}
    >
      {labels[state]}
    </button>
  )
}
