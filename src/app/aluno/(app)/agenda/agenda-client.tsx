'use client'

import { useMemo, useState, useTransition } from 'react'
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
const HORA_PX = 52

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

function startOfWeek(d: Date): Date {
  const r = new Date(d)
  r.setDate(d.getDate() - d.getDay())
  r.setHours(0, 0, 0, 0)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
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

  const [view, setView] = useState<'semana' | 'mes'>('semana')
  const [anchor, setAnchor] = useState(() => new Date())

  const [titulo, setTitulo] = useState('')
  const [dia, setDia] = useState(0)
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [cor, setCor] = useState(0)
  const [notaTexto, setNotaTexto] = useState('')

  const hoje = new Date()

  function navegar(delta: number) {
    setAnchor((prev) =>
      view === 'semana' ? addDays(prev, delta * 7) : new Date(prev.getFullYear(), prev.getMonth() + delta, 1)
    )
  }

  const semanaDias = useMemo(() => {
    const ini = startOfWeek(anchor)
    return Array.from({ length: 7 }, (_, i) => addDays(ini, i))
  }, [anchor])

  const { horaIni, horaFim } = useMemo(() => {
    const mins = blocos.flatMap((b) => [toMin(b.hora_inicio), toMin(b.hora_fim)])
    const ini = mins.length ? Math.min(7, Math.floor(Math.min(...mins) / 60)) : 7
    const fimH = mins.length ? Math.max(21, Math.ceil(Math.max(...mins) / 60)) : 21
    return { horaIni: ini, horaFim: fimH }
  }, [blocos])

  const horas = useMemo(
    () => Array.from({ length: horaFim - horaIni + 1 }, (_, i) => horaIni + i),
    [horaIni, horaFim]
  )
  const alturaGrade = (horaFim - horaIni) * HORA_PX

  const mesCelulas = useMemo(() => {
    const primeiro = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const ini = startOfWeek(primeiro)
    return Array.from({ length: 42 }, (_, i) => addDays(ini, i))
  }, [anchor])

  const rotuloPeriodo =
    view === 'semana'
      ? `${semanaDias[0].getDate()} ${semanaDias[0]
          .toLocaleDateString('pt-BR', { month: 'short' })
          .replace('.', '')} – ${semanaDias[6].getDate()} ${semanaDias[6]
          .toLocaleDateString('pt-BR', { month: 'short' })
          .replace('.', '')} ${semanaDias[6].getFullYear()}`
      : anchor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Grade semanal</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Seus horários fixos de estudo — organização pessoal, não muda a fila de revisão.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navegar(-1)}
                aria-label={view === 'semana' ? 'Semana anterior' : 'Mês anterior'}
                className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setAnchor(new Date())}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => navegar(1)}
                aria-label={view === 'semana' ? 'Próxima semana' : 'Próximo mês'}
                className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted"
              >
                ›
              </button>
            </div>
            <span className="min-w-[130px] text-center text-sm font-semibold capitalize text-foreground">
              {rotuloPeriodo}
            </span>
            <div className="flex items-center rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => setView('semana')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  view === 'semana' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Semana
              </button>
              <button
                type="button"
                onClick={() => setView('mes')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  view === 'mes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Mês
              </button>
            </div>
          </div>
        </div>

        {view === 'semana' ? (
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="grid" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
                <div />
                {semanaDias.map((d, i) => {
                  const ehHoje = sameDay(d, hoje)
                  return (
                    <div key={i} className="pb-2 text-center">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70">
                        {DIAS[i].slice(0, 3)}
                      </div>
                      <div
                        className={`mx-auto mt-1 flex size-7 items-center justify-center rounded-full text-sm font-semibold ${
                          ehHoje ? 'bg-primary text-primary-foreground' : 'text-foreground'
                        }`}
                      >
                        {d.getDate()}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div
                className="grid rounded-xl border border-border"
                style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}
              >
                <div className="relative" style={{ height: alturaGrade }}>
                  {horas.slice(0, -1).map((h) => (
                    <div
                      key={h}
                      className={`absolute right-2 text-[10px] tabular-nums text-muted-foreground/70 ${
                        h > horaIni ? '-translate-y-1/2' : ''
                      }`}
                      style={{ top: h > horaIni ? (h - horaIni) * HORA_PX : 2 }}
                    >
                      {String(h).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>
                {semanaDias.map((d, colIdx) => {
                  const doDia = blocos.filter((b) => b.dia_semana === d.getDay())
                  const ehHoje = sameDay(d, hoje)
                  return (
                    <div
                      key={colIdx}
                      className={`relative border-l border-border ${ehHoje ? 'bg-primary/[0.03]' : ''}`}
                      style={{ height: alturaGrade }}
                    >
                      {horas.slice(1, -1).map((h) => (
                        <div
                          key={h}
                          className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                          style={{ top: (h - horaIni) * HORA_PX }}
                        />
                      ))}
                      {doDia.map((b) => {
                        const c = CORES[b.cor % CORES.length]
                        const top = ((toMin(b.hora_inicio) - horaIni * 60) / 60) * HORA_PX
                        const altura = Math.max(
                          30,
                          ((toMin(b.hora_fim) - toMin(b.hora_inicio)) / 60) * HORA_PX - 3
                        )
                        return (
                          <div
                            key={b.id}
                            className="group absolute inset-x-1 overflow-hidden rounded-lg p-1.5 text-[11px] leading-tight shadow-sm"
                            style={{ top: top + 1, height: altura, background: `${c}1C`, borderLeft: `3px solid ${c}` }}
                          >
                            <button
                              onClick={() => removerBloco(b.id)}
                              aria-label="Remover"
                              className="absolute right-1 top-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              ✕
                            </button>
                            <div className="truncate font-semibold text-foreground">{b.titulo}</div>
                            <div className="mt-0.5 tabular-nums text-muted-foreground">
                              {b.hora_inicio.slice(0, 5)}–{b.hora_fim.slice(0, 5)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-7">
                {DIAS.map((nome, i) => (
                  <div
                    key={i}
                    className="pb-2 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70"
                  >
                    {nome.slice(0, 3)}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
                {mesCelulas.map((d, i) => {
                  const doMes = d.getMonth() === anchor.getMonth()
                  const ehHoje = sameDay(d, hoje)
                  const doDia = blocos.filter((b) => b.dia_semana === d.getDay())
                  return (
                    <div key={i} className={`min-h-[84px] p-1.5 ${doMes ? 'bg-card' : 'bg-muted/40'}`}>
                      <div
                        className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                          ehHoje
                            ? 'bg-primary text-primary-foreground'
                            : doMes
                              ? 'text-foreground'
                              : 'text-muted-foreground/50'
                        }`}
                      >
                        {d.getDate()}
                      </div>
                      {doDia.map((b) => {
                        const c = CORES[b.cor % CORES.length]
                        return (
                          <div
                            key={b.id}
                            title={`${b.titulo} · ${b.hora_inicio.slice(0, 5)}–${b.hora_fim.slice(0, 5)}`}
                            className={`mt-1 truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                              doMes ? 'text-foreground' : 'text-muted-foreground/60'
                            }`}
                            style={{ background: `${c}1C`, borderLeft: `2px solid ${c}` }}
                          >
                            <span className="tabular-nums text-muted-foreground">{b.hora_inicio.slice(0, 5)}</span>{' '}
                            {b.titulo}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground/70">
                A grade é semanal recorrente — os blocos se repetem em todas as semanas do mês.
              </p>
            </div>
          </div>
        )}

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
