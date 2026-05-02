'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { STATUS_LABELS } from '@/types'
import type { QuestionStatus } from '@/types'

const STATUSES: QuestionStatus[] = ['extracted', 'reviewing', 'approved', 'flagged', 'rejected', 'commented', 'published']

interface QuestoesFiltersProps {
  boards: { slug: string; short_name: string }[]
  years: number[]
  modulos: string[]
  current: {
    q?: string
    status?: string
    year?: string
    board?: string
    modulo?: string
  }
}

export function QuestoesFilters({ boards, years, modulos, current }: QuestoesFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page')
      startTransition(() => {
        router.push(`/questoes?${params.toString()}`)
      })
    },
    [router, searchParams]
  )

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    updateParam('q', (fd.get('q') as string) ?? '')
  }

  function clearAll() {
    startTransition(() => {
      router.push('/questoes')
    })
  }

  const hasFilters = !!(current.q || current.status || current.year || current.board || current.modulo)

  return (
    <div className="flex flex-wrap gap-3 items-end">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-48">
        <input
          name="q"
          type="text"
          defaultValue={current.q ?? ''}
          placeholder="Buscar no enunciado…"
          className="flex-1 h-9 rounded-lg border border-white/8 bg-white/4 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
        />
        <button
          type="submit"
          className="h-9 px-3 rounded-lg border border-white/8 text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
        >
          Buscar
        </button>
      </form>

      {/* Status */}
      <select
        value={current.status ?? ''}
        onChange={(e) => updateParam('status', e.target.value)}
        className="h-9 rounded-lg border border-white/8 bg-[var(--mm-surface)] px-3 text-xs text-foreground outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
      >
        <option value="">Todos os status</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      {/* Ano */}
      {years.length > 0 && (
        <select
          value={current.year ?? ''}
          onChange={(e) => updateParam('year', e.target.value)}
          className="h-9 rounded-lg border border-white/8 bg-[var(--mm-surface)] px-3 text-xs text-foreground outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
        >
          <option value="">Todos os anos</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      )}

      {/* Banca */}
      {boards.length > 0 && (
        <select
          value={current.board ?? ''}
          onChange={(e) => updateParam('board', e.target.value)}
          className="h-9 rounded-lg border border-white/8 bg-[var(--mm-surface)] px-3 text-xs text-foreground outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
        >
          <option value="">Todas as bancas</option>
          {boards.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.short_name}
            </option>
          ))}
        </select>
      )}

      {/* Módulo */}
      {modulos.length > 0 && (
        <select
          value={current.modulo ?? ''}
          onChange={(e) => updateParam('modulo', e.target.value)}
          className="h-9 rounded-lg border border-white/8 bg-[var(--mm-surface)] px-3 text-xs text-foreground outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
        >
          <option value="">Todos os módulos</option>
          {modulos.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="h-9 px-3 rounded-lg border border-white/8 text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
        >
          Limpar
        </button>
      )}
    </div>
  )
}
