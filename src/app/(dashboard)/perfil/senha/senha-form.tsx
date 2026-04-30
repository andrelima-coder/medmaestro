'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { changePasswordAction } from '../actions'

export function SenhaForm() {
  const router = useRouter()
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    if (newPwd !== confirmPwd) {
      setFeedback('Erro: nova senha e confirmação não conferem')
      return
    }
    if (newPwd.length < 8) {
      setFeedback('Erro: nova senha precisa ter ao menos 8 caracteres')
      return
    }
    startTransition(async () => {
      const res = await changePasswordAction(currentPwd, newPwd)
      if (res.ok) {
        setFeedback('✓ Senha alterada com sucesso')
        setCurrentPwd('')
        setNewPwd('')
        setConfirmPwd('')
        setTimeout(() => router.push('/perfil'), 1500)
      } else {
        setFeedback(`Erro: ${res.error}`)
      }
    })
  }

  return (
    <form
      onSubmit={submit}
      style={{
        background: 'var(--mm-surface)',
        border: '1px solid var(--mm-line)',
        borderRadius: 12,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div>
        <label style={labelStyle}>Senha atual</label>
        <input
          type="password"
          value={currentPwd}
          onChange={(e) => setCurrentPwd(e.target.value)}
          autoComplete="current-password"
          required
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Nova senha</label>
        <input
          type="password"
          value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
          style={inputStyle}
        />
        <p style={{ fontSize: 11, color: 'var(--mm-muted)', marginTop: 4 }}>
          Mínimo 8 caracteres
        </p>
      </div>
      <div>
        <label style={labelStyle}>Confirmar nova senha</label>
        <input
          type="password"
          value={confirmPwd}
          onChange={(e) => setConfirmPwd(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
          style={inputStyle}
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
        <button type="submit" disabled={pending} style={btnPrimary(!pending)}>
          {pending ? 'Alterando…' : 'Alterar senha'}
        </button>
        <Link href="/perfil" style={btnGhost}>
          ← Voltar
        </Link>
      </div>
    </form>
  )
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
