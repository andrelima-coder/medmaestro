'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'

interface AuditFiltersProps {
  entityTypes: string[]
  current: { entity_type: string; action: string }
}

const ENTITY_LABELS: Record<string, string> = {
  question: 'Questão',
  exam: 'Exame',
  tag: 'Tag',
  simulado: 'Simulado',
  tags: 'Tags (catálogo)',
  exams: 'Exames (catálogo)',
  exam_boards: 'Bancas',
  specialties: 'Especialidades',
}

export function AuditFilters({ entityTypes, current }: AuditFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const update = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(searchParams.toString())
      if (value) p.set(key, value)
      else p.delete(key)
      p.delete('page')
      startTransition(() => router.push(`/auditoria?${p.toString()}`))
    },
    [router, searchParams]
  )

  const hasFilters = !!(current.entity_type || current.action)

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <select
        value={current.entity_type}
        onChange={(e) => update('entity_type', e.target.value)}
        className="h-9 rounded-lg border border-white/8 bg-[var(--mm-surface)] px-3 text-xs text-foreground outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
      >
        <option value="">Todos os tipos</option>
        {entityTypes.map((t) => (
          <option key={t} value={t}>
            {ENTITY_LABELS[t] ?? t}
          </option>
        ))}
      </select>

      {hasFilters && (
        <button
          onClick={() => startTransition(() => router.push('/auditoria'))}
          className="h-9 px-3 rounded-lg border border-white/8 text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
        >
          Limpar
        </button>
      )}
    </div>
  )
}
