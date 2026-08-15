'use client'

import { useState, useTransition } from 'react'
import { getBatchAction, recordPracticeAction, type PracticeResult } from './actions'
import type { PracticeQuestion } from '@/lib/aluno/estudo'

const ALTS = ['A', 'B', 'C', 'D', 'E'] as const

export function PraticarClient({
  modules,
  weakest,
  initialModule = '',
}: {
  modules: { id: string; label: string }[]
  weakest?: { tagId: string; label: string; pct: number } | null
  initialModule?: string
}) {
  const [moduleId, setModuleId] = useState<string>(initialModule)
  const [batch, setBatch] = useState<PracticeQuestion[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<PracticeResult | null>(null)
  const [acertos, setAcertos] = useState(0)
  const [isPending, startTransition] = useTransition()

  function iniciar(forced?: string) {
    const mod = forced !== undefined ? forced : moduleId
    if (forced !== undefined) setModuleId(forced)
    startTransition(async () => {
      const b = await getBatchAction(mod || null)
      setBatch(b)
      setIdx(0)
      setSelected(null)
      setResult(null)
      setAcertos(0)
    })
  }

  function responder() {
    if (!batch || !selected) return
    const q = batch[idx]
    startTransition(async () => {
      const r = await recordPracticeAction(q.id, selected)
      setResult(r)
      if (r.isCorrect) setAcertos((a) => a + 1)
    })
  }

  function proxima() {
    setResult(null)
    setSelected(null)
    setIdx((i) => i + 1)
  }

  // Tela inicial: escolher filtro.
  if (!batch) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border bg-card p-8">
        <h1 className="text-xl font-bold text-foreground">Praticar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Responda questões avulsas com correção na hora.
        </p>
        <label className="mt-5 block">
          <span className="mb-1 block text-sm font-medium text-foreground">Módulo (opcional)</span>
          <select
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Todos os módulos</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => iniciar()}
          disabled={isPending}
          className="mt-5 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {isPending ? 'Carregando…' : 'Começar'}
        </button>

        {weakest && (
          <button
            onClick={() => iniciar(weakest.tagId)}
            disabled={isPending}
            className="mt-3 w-full rounded-lg border border-[#FBAE40] px-4 py-2.5 text-sm font-medium text-[#9E6606] disabled:opacity-60"
          >
            🎯 Praticar meu ponto fraco: {weakest.label} ({weakest.pct}%)
          </button>
        )}
      </div>
    )
  }

  // Fim do lote.
  if (idx >= batch.length) {
    return (
      <div className="mm-pop-in mx-auto mt-10 max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--mm-shadow)]">
        <h1 className="text-xl font-bold text-foreground">Sessão concluída 🎉</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Você acertou {acertos} de {batch.length}.
        </p>
        <button
          onClick={() => setBatch(null)}
          className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Praticar mais
        </button>
      </div>
    )
  }

  const q = batch[idx]

  return (
    <div className="mx-auto mt-6 max-w-3xl">
      <div className="mb-2 text-xs text-muted-foreground">
        Questão {idx + 1} de {batch.length} · acertos: {acertos}
      </div>
      <div key={q.id} className="mm-animate-in rounded-2xl border border-border bg-card p-6 shadow-[var(--mm-shadow-sm)]">
        <p className="whitespace-pre-line text-foreground">{q.stem}</p>
        <div className="mt-5 space-y-2">
          {ALTS.map((alt) => {
            const text = q.alternatives[alt]
            if (!text) return null
            const isSel = selected === alt
            const isCorrect = result?.correctAnswer === alt
            const isWrongPick = result && isSel && !result.isCorrect
            return (
              <label
                key={alt}
                className={`mm-chip flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
                  result
                    ? isCorrect
                      ? 'border-[#006048] bg-[rgba(0,96,72,0.1)]'
                      : isWrongPick
                        ? 'border-[#D3402A] bg-[rgba(211,64,42,0.1)]'
                        : 'border-border opacity-60'
                    : isSel
                      ? 'border-primary bg-primary/5 shadow-[0_2px_12px_rgba(212,7,84,0.12)]'
                      : 'border-border hover:border-primary/40 hover:bg-[rgba(14,40,65,0.02)]'
                }`}
              >
                <input
                  type="radio"
                  name="alt"
                  className="mt-1"
                  checked={isSel}
                  disabled={!!result || isPending}
                  onChange={() => setSelected(alt)}
                />
                <span className="text-foreground">
                  <strong>{alt})</strong> {text}
                </span>
              </label>
            )
          })}
        </div>

        {result && (
          <div className="mm-animate-in mt-4 rounded-lg bg-muted/50 p-3 text-sm">
            <p className={result.isCorrect ? 'text-[#006048]' : 'text-[#D3402A]'}>
              {result.isCorrect ? 'Você acertou!' : `Resposta correta: ${result.correctAnswer}`}
            </p>
            {result.comment && (
              <p className="mt-2 whitespace-pre-line text-foreground">{result.comment}</p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          {!result ? (
            <button
              onClick={responder}
              disabled={!selected || isPending}
              className="mm-press rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-[0_4px_16px_rgba(212,7,84,0.25)] transition-[box-shadow,transform] duration-200 hover:shadow-[0_6px_22px_rgba(212,7,84,0.4)] disabled:bg-[#E8E8E8] disabled:text-[#A4A3A4] disabled:shadow-none"
            >
              Responder
            </button>
          ) : (
            <button
              onClick={proxima}
              className="mm-press rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-[0_4px_16px_rgba(212,7,84,0.25)] transition-[box-shadow,transform] duration-200 hover:shadow-[0_6px_22px_rgba(212,7,84,0.4)]"
            >
              {idx + 1 >= batch.length ? 'Finalizar' : 'Próxima'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
