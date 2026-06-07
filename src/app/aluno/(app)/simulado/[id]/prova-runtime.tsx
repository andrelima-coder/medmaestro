'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveAnswer, pauseAttempt, submitAttempt, syncTime } from './actions'

type Question = {
  id: string
  number: number
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

  if (!q) return <p className="text-muted-foreground">Esta prova não tem questões.</p>

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
              return (
                <button
                  key={qq.id}
                  onClick={() => setCurrent(i)}
                  className={`size-8 rounded-md border text-xs ${cls}`}
                  title={st?.locked ? 'Respondida' : 'Pendente'}
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
          className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
        >
          Finalizar prova
        </button>
      </aside>

      {/* Questão atual */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-2 text-xs text-muted-foreground">
          {campaignName} · Questão {current + 1} de {questions.length}
        </div>
        <p className="whitespace-pre-line text-foreground">{q.stem}</p>

        <div className="mt-5 space-y-2">
          {ALTS.map((alt) => {
            const text = q.alternatives[alt]
            if (!text) return null
            const isSel = selected === alt
            return (
              <label
                key={alt}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
                  isSel ? 'border-primary bg-primary/5' : 'border-border'
                } ${locked ? 'opacity-70' : ''}`}
              >
                <input
                  type="radio"
                  name="alt"
                  className="mt-1"
                  checked={isSel}
                  disabled={locked || isPending}
                  onChange={() => setSelected(alt)}
                />
                <span className="text-foreground">
                  <strong>{alt})</strong> {text}
                </span>
              </label>
            )
          })}
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        {locked && (
          <p className="mt-3 text-sm text-emerald-600">Resposta salva e travada.</p>
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
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
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
