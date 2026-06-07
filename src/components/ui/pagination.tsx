'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Pagination({
  page,
  pageSize,
  total,
  hrefForPage,
}: {
  page: number
  pageSize: number
  total: number
  /** Constrói a URL preservando filtros para a página informada. */
  hrefForPage: (page: number) => string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, page), totalPages)
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1
  const to = Math.min(current * pageSize, total)

  const hasPrev = current > 1
  const hasNext = current < totalPages

  return (
    <div className="flex items-center justify-between gap-3 px-1 py-1 text-[11px] text-[var(--mm-muted)]">
      <span>
        {total === 0
          ? 'Nenhuma questão'
          : `${from}–${to} de ${total} · página ${current}/${totalPages}`}
      </span>
      <div className="flex items-center gap-1.5">
        <PagerLink href={hrefForPage(current - 1)} disabled={!hasPrev} label="Anterior">
          <ChevronLeft className="size-3.5" />
          Anterior
        </PagerLink>
        <PagerLink href={hrefForPage(current + 1)} disabled={!hasNext} label="Próxima">
          Próxima
          <ChevronRight className="size-3.5" />
        </PagerLink>
      </div>
    </div>
  )
}

function PagerLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  const base =
    'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors'
  if (disabled) {
    return (
      <span
        aria-disabled
        className={cn(
          base,
          'cursor-not-allowed border-[var(--mm-border-default)] text-[var(--mm-muted)]/50'
        )}
      >
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        base,
        'border-[var(--mm-border-default)] text-[var(--mm-text2)] hover:border-[var(--mm-border-hover)] hover:text-foreground'
      )}
    >
      {children}
    </Link>
  )
}
