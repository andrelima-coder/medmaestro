'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Step = {
  num: number
  label: string
  href: string
  matches: (path: string) => boolean
}

const STEPS: Step[] = [
  { num: 1, label: 'Dashboard', href: '/dashboard', matches: (p) => p === '/dashboard' },
  { num: 2, label: 'Upload', href: '/lotes/novo', matches: (p) => p.startsWith('/lotes/novo') },
  {
    num: 3,
    label: 'Extração',
    href: '/lotes',
    matches: (p) => p === '/lotes' || (p.startsWith('/lotes/') && !p.startsWith('/lotes/novo')),
  },
  { num: 4, label: 'Revisão', href: '/revisao', matches: (p) => p.startsWith('/revisao') },
  { num: 5, label: 'Análise 80/20', href: '/analise', matches: (p) => p.startsWith('/analise') },
  {
    num: 6,
    label: 'Exploração',
    href: '/questoes',
    matches: (p) => p.startsWith('/questoes'),
  },
  {
    num: 7,
    label: 'Exportação',
    href: '/simulados',
    matches: (p) =>
      p.startsWith('/simulados') ||
      p.startsWith('/exportar') ||
      /\/exportar(\/|$)/.test(p),
  },
  { num: 8, label: 'Auditoria', href: '/auditoria', matches: (p) => p.startsWith('/auditoria') },
]

export function WorkflowStepper() {
  const pathname = usePathname()
  const activeIdx = STEPS.findIndex((s) => s.matches(pathname))

  return (
    <nav
      aria-label="Workflow"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        borderBottom: '1px solid var(--mm-line)',
        background: 'var(--mm-surface)',
        padding: '8px 20px',
        overflowX: 'auto',
        scrollbarWidth: 'thin',
      }}
    >
      {STEPS.map((step, i) => {
        const isActive = activeIdx === i
        const isPast = activeIdx > -1 && i < activeIdx
        const color = isActive
          ? 'var(--mm-gold)'
          : isPast
            ? 'var(--mm-green)'
            : 'var(--mm-muted)'

        return (
          <Link
            key={step.num}
            href={step.href}
            aria-current={isActive ? 'step' : undefined}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 16px',
              fontSize: 12,
              fontWeight: isActive ? 700 : 500,
              color,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-syne)',
              transition: 'color 0.15s',
              borderBottom: isActive ? '2px solid var(--mm-gold)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: '50%',
                fontSize: 11,
                fontWeight: 700,
                background: isActive
                  ? 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))'
                  : isPast
                    ? 'rgba(102, 187, 106, 0.15)'
                    : 'var(--mm-bg2)',
                color: isActive ? '#0a0a0a' : color,
                border: isActive
                  ? 'none'
                  : isPast
                    ? '1px solid rgba(102, 187, 106, 0.45)'
                    : '1px solid var(--mm-line2)',
              }}
            >
              {isPast ? (
                <svg
                  viewBox="0 0 12 12"
                  width={11}
                  height={11}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2.5 6.2L5 8.8 9.5 3.6" />
                </svg>
              ) : (
                step.num
              )}
            </span>
            <span style={{ letterSpacing: '0.3px' }}>{step.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
