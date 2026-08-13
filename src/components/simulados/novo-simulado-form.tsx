'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { createSimuladoAction } from '@/app/(dashboard)/simulados/actions'

interface Modulo {
  slug: string
  label: string
}

interface NovoSimuladoFormProps {
  modulos: Modulo[]
  countsBySlug: Record<string, number>
  poolCount: number
  variationsCount: number
}

export function NovoSimuladoForm({
  modulos,
  countsBySlug,
  poolCount,
  variationsCount,
}: NovoSimuladoFormProps) {
  const [total, setTotal] = useState(20)
  const [originalsPct, setOriginalsPct] = useState(100)
  const [moduloPct, setModuloPct] = useState<Record<string, number>>(
    () => Object.fromEntries(modulos.map((m) => [m.slug, 0]))
  )

  const variationsPct = 100 - originalsPct
  const moduloSum = useMemo(
    () => Object.values(moduloPct).reduce((s, v) => s + (v || 0), 0),
    [moduloPct]
  )

  const originalsCount = Math.round((total * originalsPct) / 100)
  const variationsTarget = total - originalsCount

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string }, formData: FormData) => {
      formData.set('total', String(total))
      formData.set('originalsPct', String(originalsPct))
      formData.set('moduloDistribution', JSON.stringify(moduloPct))
      return (await createSimuladoAction(formData)) ?? {}
    },
    {}
  )

  const distributeEvenly = () => {
    if (modulos.length === 0) return
    const base = Math.floor(100 / modulos.length)
    const remainder = 100 - base * modulos.length
    const next: Record<string, number> = {}
    modulos.forEach((m, i) => {
      next[m.slug] = base + (i < remainder ? 1 : 0)
    })
    setModuloPct(next)
  }

  const clearDistribution = () => {
    setModuloPct(Object.fromEntries(modulos.map((m) => [m.slug, 0])))
  }

  const variationsAvailable = variationsCount > 0

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="rounded-xl border border-[rgba(14,40,65,0.1)] bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Título</label>
          <input
            name="title"
            required
            autoFocus
            placeholder="Ex: Simulado TEMI 2024 — Módulo Cardiologia"
            className="h-10 rounded-lg border border-[rgba(14,40,65,0.1)] bg-[rgba(14,40,65,0.04)] px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Total de questões
            </label>
            <input
              type="number"
              min={0}
              max={500}
              value={total}
              onChange={(e) => setTotal(Math.max(0, parseInt(e.target.value) || 0))}
              className="h-10 rounded-lg border border-[rgba(14,40,65,0.1)] bg-[rgba(14,40,65,0.04)] px-3 text-sm text-foreground outline-none focus:border-[var(--mm-gold)]/40"
            />
            <p className="text-[11px] text-muted-foreground/70">
              Pool elegível: {poolCount} originais · {variationsCount} variações aprovadas
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Originais vs. Variações
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={originalsPct}
                onChange={(e) => setOriginalsPct(parseInt(e.target.value))}
                disabled={!variationsAvailable}
                className="flex-1 accent-[var(--mm-gold)]"
              />
              <span className="text-xs tabular-nums text-foreground w-10 text-right">
                {originalsPct}%
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground/70">
              {originalsCount} originais · {variationsTarget} variações
              {!variationsAvailable && ' (variações indisponíveis)'}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(14,40,65,0.1)] bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Distribuição por módulo</h3>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Soma dos pesos: {moduloSum}% {moduloSum === 0 && '(sem filtro de módulo — sorteio livre)'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={distributeEvenly}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Distribuir igualmente
            </button>
            <span className="text-muted-foreground/30">·</span>
            <button
              type="button"
              onClick={clearDistribution}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Limpar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {modulos.map((m) => {
            const pct = moduloPct[m.slug] ?? 0
            const targetN = moduloSum > 0 ? Math.round((originalsCount * pct) / moduloSum) : 0
            const available = countsBySlug[m.slug] ?? 0
            const insufficient = targetN > available
            return (
              <div key={m.slug} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-foreground truncate" title={m.label}>
                    {m.label}
                  </label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {available} disp.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={pct}
                    onChange={(e) =>
                      setModuloPct((prev) => ({
                        ...prev,
                        [m.slug]: parseInt(e.target.value),
                      }))
                    }
                    className="flex-1 accent-[var(--mm-gold)]"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={pct}
                    onChange={(e) =>
                      setModuloPct((prev) => ({
                        ...prev,
                        [m.slug]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)),
                      }))
                    }
                    className="w-14 h-7 rounded border border-[rgba(14,40,65,0.1)] bg-[rgba(14,40,65,0.04)] px-1.5 text-xs text-foreground tabular-nums text-right outline-none focus:border-[var(--mm-gold)]/40"
                  />
                  <span className="text-[11px] text-muted-foreground/60 w-3">%</span>
                </div>
                {pct > 0 && (
                  <p
                    className={`text-[10px] tabular-nums ${
                      insufficient ? 'text-[#9E6606]' : 'text-muted-foreground/60'
                    }`}
                  >
                    alvo: {targetN}
                    {insufficient && ` · só ${available} disponível`}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {state?.error && (
        <p className="text-xs text-[#D3402A]">{state.error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending || total < 1}
          className="rounded-lg border border-[var(--mm-gold)]/30 bg-[var(--mm-gold)]/10 px-5 py-2.5 text-sm font-medium text-[var(--mm-gold)] hover:bg-[var(--mm-gold)]/20 transition-colors disabled:opacity-40"
        >
          {isPending ? 'Criando…' : 'Criar simulado →'}
        </button>
        <Link
          href="/simulados"
          className="rounded-lg border border-[rgba(14,40,65,0.1)] px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-[rgba(14,40,65,0.04)] transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
