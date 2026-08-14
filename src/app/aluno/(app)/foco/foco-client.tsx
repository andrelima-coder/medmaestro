'use client'

import { useEffect, useRef, useState } from 'react'
import { registrarSessaoAction } from './actions'

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function FocoClient({ modulos }: { modulos: { slug: string; label: string }[] }) {
  const [rodando, setRodando] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [modulo, setModulo] = useState('')
  const [status, setStatus] = useState('Pronto pra começar')
  const [salvando, setSalvando] = useState(false)
  const inicioRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  function iniciar() {
    setRodando(true)
    setStatus('Em andamento…')
    inicioRef.current = Date.now()
    intervalRef.current = setInterval(() => setElapsed(Date.now() - inicioRef.current), 1000)
  }

  async function parar() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setRodando(false)
    setSalvando(true)
    setStatus('Registrando…')
    const minutos = Math.max(1, Math.round((Date.now() - inicioRef.current) / 60000))
    const res = await registrarSessaoAction(modulo || null, minutos)
    setSalvando(false)
    setElapsed(0)
    if (!res.ok) {
      setStatus('Erro ao registrar: ' + res.error)
      return
    }
    setStatus(`Sessão de ${minutos} min registrada · +${res.pontos} pontos`)
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground">Foco</h1>

      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h2 className="text-base font-bold text-foreground">Sessão de foco</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cronometre um bloco de estudo — cada minuto vira XP (até 60 pts por sessão).
        </p>

        <div className="mt-6">
          <div
            className="font-mono text-5xl font-extrabold tabular-nums"
            style={{ color: rodando ? 'var(--primary)' : 'var(--foreground)' }}
          >
            {fmt(elapsed)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{status}</div>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <select
            value={modulo}
            onChange={(e) => setModulo(e.target.value)}
            disabled={rodando}
            className="min-w-[220px] rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none disabled:opacity-60"
          >
            <option value="">Sem módulo específico</option>
            {modulos.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          {!rodando ? (
            <button
              onClick={iniciar}
              disabled={salvando}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Iniciar
            </button>
          ) : (
            <button
              onClick={parar}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Parar e registrar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
