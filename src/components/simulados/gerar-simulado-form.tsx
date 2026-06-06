'use client'

import { useActionState, useState } from 'react'
import { createSimuladoFromFiltersAction } from '@/app/(dashboard)/simulados/actions'
import { cn } from '@/lib/utils'

export type GerarFilters = Record<string, string>

type Breakdown = { label: string; count: number }

interface GerarSimuladoFormProps {
  filters: GerarFilters
  activeChips: string[]
  poolCount: number
  difBreakdown: Breakdown[]
  modBreakdown: Breakdown[]
  suggestedTitle: string
}

type Proportion = 'random' | 'dificuldade' | 'tema'
type Format = 'questoes' | 'comentarios' | 'ambos'

function breakdownHint(items: Breakdown[]): string {
  if (items.length === 0) return 'sem dados de classificação'
  return items
    .slice(0, 5)
    .map((b) => `${b.label} ${b.count}`)
    .join(' · ')
}

export function GerarSimuladoForm({
  filters,
  activeChips,
  poolCount,
  difBreakdown,
  modBreakdown,
  suggestedTitle,
}: GerarSimuladoFormProps) {
  const [total, setTotal] = useState(Math.min(20, poolCount) || 1)
  const [proportion, setProportion] = useState<Proportion>('random')
  const [format, setFormat] = useState<Format>('comentarios')

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string }, fd: FormData) => {
      return (await createSimuladoFromFiltersAction(fd)) ?? {}
    },
    {}
  )

  const clampedTotal = Math.max(1, Math.min(total || 1, poolCount))

  const proportionOptions: { value: Proportion; label: string; hint: string }[] = [
    { value: 'random', label: 'Aleatória', hint: 'Sorteio simples dentro do pool filtrado.' },
    {
      value: 'dificuldade',
      label: 'Proporcional por dificuldade',
      hint: `Mantém a proporção do pool — ${breakdownHint(difBreakdown)}`,
    },
    {
      value: 'tema',
      label: 'Proporcional por tema (módulo)',
      hint: `Mantém a proporção por área — ${breakdownHint(modBreakdown)}`,
    },
  ]

  const formatOptions: { value: Format; label: string; hint: string }[] = [
    { value: 'questoes', label: 'Apenas questões', hint: 'Enunciado, alternativas e gabarito (sem comentários).' },
    { value: 'comentarios', label: 'Questões + comentários', hint: 'Inclui os comentários editoriais por questão.' },
    { value: 'ambos', label: 'Ambos os cadernos', hint: 'Permite baixar a versão com e sem comentários.' },
  ]

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* Hidden: carrega os filtros para a server action */}
      {Object.entries(filters).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null
      )}
      <input type="hidden" name="proportion" value={proportion} />
      <input type="hidden" name="format" value={format} />
      <input type="hidden" name="total" value={clampedTotal} />

      {/* Pool / filtros ativos */}
      <div className="rounded-xl border border-[var(--mm-border-default)] bg-[var(--mm-surface)]/60 p-4">
        <p className="text-[13px] text-foreground">
          <strong className="text-[var(--mm-gold)]">{poolCount.toLocaleString('pt-BR')}</strong>{' '}
          questões correspondem aos filtros selecionados.
        </p>
        {activeChips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {activeChips.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-full border border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)] px-2.5 py-0.5 text-[11px] text-[var(--mm-gold)]"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Título */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[var(--mm-muted)]">Título do simulado</label>
        <input
          name="title"
          required
          defaultValue={suggestedTitle}
          className="h-10 rounded-lg border border-[var(--mm-border-default)] bg-white/[0.04] px-3 text-sm text-foreground outline-none transition-colors focus:border-[var(--mm-border-active)]"
        />
      </div>

      {/* Quantidade */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[var(--mm-muted)]">
          Quantidade de questões{' '}
          <span className="text-[var(--mm-muted)]/70">(máx. {poolCount})</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={poolCount}
            value={total}
            onChange={(e) => setTotal(parseInt(e.target.value, 10) || 0)}
            className="h-10 w-28 rounded-lg border border-[var(--mm-border-default)] bg-white/[0.04] px-3 text-sm text-foreground outline-none transition-colors focus:border-[var(--mm-border-active)]"
          />
          <input
            type="range"
            min={1}
            max={poolCount}
            value={clampedTotal}
            onChange={(e) => setTotal(parseInt(e.target.value, 10))}
            className="flex-1 accent-[var(--mm-gold)]"
          />
          {total > poolCount && (
            <span className="text-[11px] text-[var(--mm-orange)]">
              limitado a {poolCount}
            </span>
          )}
        </div>
      </div>

      {/* Proporção */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-[var(--mm-muted)]">Distribuição</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {proportionOptions.map((o) => {
            const active = proportion === o.value
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => setProportion(o.value)}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                  active
                    ? 'border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)]'
                    : 'border-[var(--mm-border-default)] hover:border-[var(--mm-border-hover)]'
                )}
              >
                <span className={cn('text-[13px] font-semibold', active ? 'text-[var(--mm-gold)]' : 'text-foreground')}>
                  {o.label}
                </span>
                <span className="text-[11px] leading-snug text-[var(--mm-muted)]">{o.hint}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Formato do caderno */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-[var(--mm-muted)]">Formato do caderno</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {formatOptions.map((o) => {
            const active = format === o.value
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => setFormat(o.value)}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                  active
                    ? 'border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)]'
                    : 'border-[var(--mm-border-default)] hover:border-[var(--mm-border-hover)]'
                )}
              >
                <span className={cn('text-[13px] font-semibold', active ? 'text-[var(--mm-gold)]' : 'text-foreground')}>
                  {o.label}
                </span>
                <span className="text-[11px] leading-snug text-[var(--mm-muted)]">{o.hint}</span>
              </button>
            )
          })}
        </div>
      </div>

      {state?.error && (
        <p className="rounded-lg border border-[rgba(239,83,80,0.30)] bg-[rgba(239,83,80,0.08)] p-3 text-sm text-[var(--mm-red)]">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || poolCount === 0}
          className={cn(
            'inline-flex h-10 items-center rounded-lg px-5 text-sm font-bold transition-all',
            pending || poolCount === 0
              ? 'cursor-not-allowed border border-[var(--mm-border-default)] text-[var(--mm-muted)]'
              : 'text-[#0A0A0A] hover:-translate-y-px'
          )}
          style={
            pending || poolCount === 0
              ? undefined
              : {
                  background: 'linear-gradient(135deg, var(--mm-gold) 0%, var(--mm-orange) 100%)',
                  boxShadow: '0 4px 20px rgba(201,120,30,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                }
          }
        >
          {pending ? 'Gerando…' : `Gerar simulado (${clampedTotal} questões) →`}
        </button>
      </div>
    </form>
  )
}
