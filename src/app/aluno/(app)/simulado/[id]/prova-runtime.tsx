'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveAnswer, pauseAttempt, submitAttempt, syncTime, reportarErro, logTrocaResposta } from './actions'

type Question = {
  id: string
  number: number
  origem?: string | null
  stem: string
  alternatives: Record<string, string>
}

type Saved = Record<string, { alt: string | null; locked: boolean }>

const ALTS = ['A', 'B', 'C', 'D', 'E'] as const

function fmt(seconds: number): string {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

export function ProvaRuntime({
  campaignId,
  campaignName,
  attemptId,
  initialRemaining,
  pauseAllowed,
  questions,
  saved,
}: {
  campaignId: string
  campaignName: string
  attemptId: string
  initialRemaining: number
  pauseAllowed: boolean
  questions: Question[]
  saved: Saved
}) {
  const router = useRouter()
  const [current, setCurrent] = useState(0)
  const [remaining, setRemaining] = useState(initialRemaining)
  const [answers, setAnswers] = useState<Saved>(saved)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Ferramentas de prova (T019) — estado client-side por questão.
  const [eliminated, setEliminated] = useState<Record<string, string[]>>({})
  const [flagged, setFlagged] = useState<Record<string, boolean>>({})
  const [reported, setReported] = useState<Record<string, boolean>>({})
  const stemRef = useRef<HTMLParagraphElement>(null)
  const submittedRef = useRef(false)

  const q = questions[current]
  const qState = q ? answers[q.id] : undefined
  const locked = !!qState?.locked

  // Sincroniza a seleção exibida ao trocar de questão.
  useEffect(() => {
    setSelected(qState?.alt ?? null)
    setError(null)
  }, [current]) // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(() => {
    if (submittedRef.current) return
    submittedRef.current = true
    startTransition(async () => {
      await submitAttempt(attemptId)
      router.push(`/aluno/simulado/${campaignId}/resultado`)
    })
  }, [attemptId, campaignId, router])

  // Cronômetro local (1s) + reconciliação com o servidor (a cada 20s).
  useEffect(() => {
    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(tick)
          finish()
          return 0
        }
        return r - 1
      })
    }, 1000)
    const sync = setInterval(async () => {
      const res = await syncTime(attemptId)
      if (res.ok) {
        setRemaining(res.data.remaining)
        if (res.data.status !== 'em_andamento') finish()
      }
    }, 20000)
    return () => {
      clearInterval(tick)
      clearInterval(sync)
    }
  }, [attemptId, finish])

  function onSave() {
    if (!q || !selected) return
    startTransition(async () => {
      const res = await saveAnswer(attemptId, q.id, selected)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setAnswers((a) => ({ ...a, [q.id]: { alt: selected, locked: true } }))
      setRemaining(res.data.remaining)
      if (current < questions.length - 1) setCurrent((c) => c + 1)
    })
  }

  function onPause() {
    startTransition(async () => {
      const res = await pauseAttempt(attemptId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push('/aluno')
    })
  }

  function toggleEliminate(alt: string) {
    if (!q) return
    setEliminated((e) => {
      const cur = new Set(e[q.id] ?? [])
      if (cur.has(alt)) cur.delete(alt)
      else cur.add(alt)
      if (selected === alt) setSelected(null) // não manter selecionada uma eliminada
      return { ...e, [q.id]: [...cur] }
    })
  }

  function highlightSelection() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    if (stemRef.current && stemRef.current.contains(range.commonAncestorContainer)) {
      try {
        const mark = document.createElement('mark')
        mark.style.background = '#fde68a'
        range.surroundContents(mark)
        sel.removeAllRanges()
      } catch {
        /* seleção atravessa nós — ignora */
      }
    }
  }

  function toggleFlag() {
    if (!q) return
    setFlagged((f) => ({ ...f, [q.id]: !f[q.id] }))
  }

  function onReport() {
    if (!q) return
    const motivo = window.prompt('O que parece errado nesta questão? (enviado à curadoria)')
    if (!motivo) return
    startTransition(async () => {
      const res = await reportarErro(q.id, motivo)
      if (res.ok) setReported((r) => ({ ...r, [q.id]: true }))
    })
  }

  if (!q) return <p className="text-muted-foreground">Esta prova não tem questões.</p>

  const elim = new Set(eliminated[q.id] ?? [])

  const answeredCount = Object.values(answers).filter((a) => a.locked).length

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      {/* Mapa de questões + cronômetro */}
      <aside className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-xs text-muted-foreground">Tempo restante</div>
          <div className="font-mono text-2xl font-bold text-foreground">{fmt(remaining)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-xs text-muted-foreground">
            {answeredCount}/{questions.length} respondidas
          </div>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((qq, i) => {
              const st = answers[qq.id]
              const cls = st?.locked
                ? 'bg-primary text-primary-foreground'
                : i === current
                  ? 'border-primary text-foreground'
                  : 'border-border text-muted-foreground'
              const flag = flagged[qq.id] ? ' ring-2 ring-[#FBAE40]' : ''
              return (
                <button
                  key={qq.id}
                  onClick={() => setCurrent(i)}
                  className={`size-8 rounded-md border text-xs ${cls}${flag}`}
                  title={flagged[qq.id] ? 'Sinalizada' : st?.locked ? 'Respondida' : 'Pendente'}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
        </div>
        {pauseAllowed && (
          <button
            onClick={onPause}
            disabled={isPending}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground"
          >
            Pausar e sair
          </button>
        )}
        <button
          onClick={finish}
          disabled={isPending}
          className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:bg-[#E8E8E8] disabled:text-[#A4A3A4]"
        >
          Finalizar prova
        </button>
      </aside>

      {/* Questão atual */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-2 text-xs text-muted-foreground">
          {campaignName} · Questão {current + 1} de {questions.length}
          {q.origem ? ` · ${q.origem}` : ''}
        </div>

        {/* Ferramentas de prova (T019) */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={highlightSelection}
            className="rounded-md border border-border px-2 py-1 text-xs text-foreground"
          >
            Marca-texto
          </button>
          <button
            type="button"
            onClick={toggleFlag}
            className={`rounded-md border px-2 py-1 text-xs ${
              flagged[q.id] ? 'border-[#FBAE40] text-[#9E6606]' : 'border-border text-foreground'
            }`}
          >
            {flagged[q.id] ? 'Sinalizada' : 'Sinalizar'}
          </button>
          <button
            type="button"
            onClick={onReport}
            disabled={reported[q.id] || isPending}
            className="rounded-md border border-border px-2 py-1 text-xs text-foreground disabled:opacity-50"
          >
            {reported[q.id] ? 'Erro reportado' : 'Reportar erro'}
          </button>
        </div>

        <p ref={stemRef} className="whitespace-pre-line text-foreground">
          {q.stem}
        </p>

        <div className="mt-5 space-y-2">
          {ALTS.map((alt) => {
            const text = q.alternatives[alt]
            if (!text) return null
            const isSel = selected === alt
            const isElim = elim.has(alt)
            return (
              <div
                key={alt}
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  isSel ? 'border-primary bg-primary/5' : 'border-border'
                } ${locked ? 'opacity-70' : ''} ${isElim ? 'opacity-50' : ''}`}
              >
                <input
                  type="radio"
                  name="alt"
                  className="mt-1"
                  checked={isSel}
                  disabled={locked || isPending || isElim}
                  onChange={() => {
                    if (selected && selected !== alt) {
                      // Telemetria best-effort — não usa o startTransition compartilhado
                      // pra não desabilitar os radios (isPending) a cada troca.
                      void logTrocaResposta(attemptId, q.id, selected, alt)
                    }
                    setSelected(alt)
                  }}
                />
                <span className={`flex-1 text-foreground ${isElim ? 'line-through' : ''}`}>
                  <strong>{alt})</strong> {text}
                </span>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => toggleEliminate(alt)}
                    title={isElim ? 'Restaurar alternativa' : 'Eliminar alternativa'}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {isElim ? '↶' : '✕'}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {error && <p className="mt-3 text-sm text-[#D3402A]">{error}</p>}
        {locked && (
          <p className="mt-3 text-sm text-[#006048]">Resposta salva e travada.</p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            disabled={current === 0}
            className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
          >
            Anterior
          </button>
          <div className="flex gap-2">
            {!locked && (
              <button
                onClick={onSave}
                disabled={!selected || isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:bg-[#E8E8E8] disabled:text-[#A4A3A4]"
              >
                Salvar resposta
              </button>
            )}
            <button
              onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
              disabled={current === questions.length - 1}
              className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
            >
              {locked ? 'Próxima' : 'Pular'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
