'use client'

import { useState, useTransition } from 'react'
import {
  createBlocoAction,
  deleteBlocoAction,
  createNotaAction,
  deleteNotaAction,
} from './actions'

export type AgendaBloco = {
  id: string
  titulo: string
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  cor: number
}

export type AgendaNota = {
  id: string
  texto: string
  created_at: string
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const CORES = ['#D40754', '#206973', '#9E6606', '#006048', '#0E2841']

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

export function AgendaClient({
  initialBlocos,
  initialNotas,
}: {
  initialBlocos: AgendaBloco[]
  initialNotas: AgendaNota[]
}) {
  const [blocos, setBlocos] = useState(initialBlocos)
  const [notas, setNotas] = useState(initialNotas)
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const [titulo, setTitulo] = useState('')
  const [dia, setDia] = useState(0)
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [cor, setCor] = useState(0)
  const [notaTexto, setNotaTexto] = useState('')

  function submitBloco(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    startTransition(async () => {
      const res = await createBlocoAction({ titulo, diaSemana: dia, horaInicio: inicio, horaFim: fim, cor })
      if (!res.ok) return setErro(res.error ?? 'Falha ao salvar.')
      setBlocos((prev) =>
        [...prev, { id: crypto.randomUUID(), titulo, dia_semana: dia, hora_inicio: inicio, hora_fim: fim, cor }].sort(
          (a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio)
        )
      )
      setTitulo('')
      setInicio('')
      setFim('')
    })
  }

  function removerBloco(id: string) {
    setBlocos((prev) => prev.filter((b) => b.id !== id))
    startTransition(() => {
      void deleteBlocoAction(id)
    })
  }

  function submitNota(e: React.FormEvent) {
    e.preventDefault()
    const texto = notaTexto.trim()
    if (!texto) return
    setErro(null)
    startTransition(async () => {
      const res = await createNotaAction(texto)
      if (!res.ok) return setErro(res.error ?? 'Falha ao salvar.')
      setNotas((prev) => [{ id: crypto.randomUUID(), texto, created_at: new Date().toISOString() }, ...prev])
      setNotaTexto('')
    })
  }

  function removerNota(id: string) {
    setNotas((prev) => prev.filter((n) => n.id !== id))
    startTransition(() => {
      void deleteNotaAction(id)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground">Agenda</h1>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-base font-bold text-foreground">Grade semanal</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Seus horários fixos de estudo — organização pessoal, não muda a fila de revisão.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-7">
          {DIAS.map((nome, idx) => {
            const doDia = blocos.filter((b) => b.dia_semana === idx)
            return (
              <div key={idx} className="rounded-xl bg-muted/40 p-2.5">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70">
                  {nome.slice(0, 3)}
                </div>
                {doDia.length ? (
                  doDia.map((b) => (
                    <div
                      key={b.id}
                      className="group relative mb-1.5 rounded-lg bg-card p-2 text-xs shadow-sm"
                      style={{ borderLeft: `3px solid ${CORES[b.cor % CORES.length]}` }}
                    >
                      <button
                        onClick={() => removerBloco(b.id)}
                        aria-label="Remover"
                        className="absolute right-1.5 top-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        ✕
                      </button>
                      <div className="font-semibold text-foreground">{b.titulo}</div>
                      <div className="mt-0.5 text-muted-foreground">
                        {b.hora_inicio.slice(0, 5)}–{b.hora_fim.slice(0, 5)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-[11px] italic text-muted-foreground/50">—</div>
                )}
              </div>
            )
          })}
        </div>

        <form onSubmit={submitBloco} className="mt-5 flex flex-wrap items-center gap-2">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título (ex: Cardiovascular)"
            required
            className="min-w-[180px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <select
            value={dia}
            onChange={(e) => setDia(Number(e.target.value))}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          >
            {DIAS.map((n, i) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            required
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
          <input
            type="time"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            required
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
          <div className="flex items-center gap-1.5">
            {CORES.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCor(i)}
                aria-label={`Cor ${i + 1}`}
                className="size-5 rounded-full"
                style={{ background: c, border: cor === i ? '2px solid var(--foreground)' : '2px solid transparent' }}
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            + Adicionar
          </button>
        </form>
        {erro && <p className="mt-2 text-sm text-[#D3402A]">{erro}</p>}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-base font-bold text-foreground">Minhas anotações</h2>
        <form onSubmit={submitNota} className="mt-3 flex items-start gap-2">
          <textarea
            value={notaTexto}
            onChange={(e) => setNotaTexto(e.target.value)}
            placeholder="Anote algo — um lembrete, uma dúvida, um insight..."
            required
            className="min-h-[44px] flex-1 resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            Salvar
          </button>
        </form>
        <div className="mt-4">
          {notas.length ? (
            notas.map((n) => (
              <div key={n.id} className="border-b border-border py-2.5 text-sm last:border-b-0">
                <div className="whitespace-pre-wrap text-foreground">{n.texto}</div>
                <div className="mt-1 flex justify-between">
                  <span className="text-xs text-muted-foreground">{relTime(n.created_at)}</span>
                  <button
                    onClick={() => removerNota(n.id)}
                    className="text-xs font-semibold text-[#D3402A]"
                  >
                    remover
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma anotação ainda.</p>
          )}
        </div>
      </div>
    </div>
  )
}
