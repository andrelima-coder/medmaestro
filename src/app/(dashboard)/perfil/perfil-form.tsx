'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfileAction } from './actions'

export function PerfilForm({ initialFullName }: { initialFullName: string }) {
  const router = useRouter()
  const [fullName, setFullName] = useState(initialFullName)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  function save() {
    setFeedback(null)
    startTransition(async () => {
      const res = await updateProfileAction(fullName)
      if (res.ok) {
        setFeedback('✓ Perfil atualizado')
        router.refresh()
      } else {
        setFeedback(`Erro: ${res.error}`)
      }
    })
  }

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
      <h3 style={sectionTitle}>Informações pessoais</h3>

      <div>
        <label style={labelStyle}>Nome completo</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          maxLength={200}
          style={inputStyle}
          placeholder="Seu nome"
        />
      </div>

      {feedback && (
        <div
          style={{
            fontSize: 12,
            color: feedback.startsWith('Erro') ? '#EF5350' : '#66BB6A',
          }}
        >
          {feedback}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={save} disabled={pending} style={btnPrimary(!pending)}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        <Link href="/perfil/senha" style={btnGhost}>
          Mudar senha →
        </Link>
      </div>
    </div>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--mm-muted)',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--mm-muted)',
  marginBottom: 6,
  fontWeight: 600,
  letterSpacing: '0.3px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--mm-bg2)',
  border: '1px solid var(--mm-line2)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  color: 'var(--mm-text)',
}

function btnPrimary(active: boolean): React.CSSProperties {
  return {
    background: active
      ? 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))'
      : 'var(--mm-bg2)',
    color: active ? '#0a0a0a' : 'var(--mm-muted)',
    fontFamily: 'var(--font-syne)',
    fontSize: 12,
    fontWeight: 700,
    padding: '8px 18px',
    borderRadius: 8,
    border: 'none',
    cursor: active ? 'pointer' : 'default',
  }
}

const btnGhost: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--mm-text2)',
  textDecoration: 'none',
  padding: '8px 14px',
  border: '1px solid var(--mm-line2)',
  borderRadius: 8,
}
