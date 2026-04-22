'use client'

import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  questoes: 'Questões',
  revisao: 'Revisão',
  lotes: 'Lotes',
  simulados: 'Simulados',
  analise: 'Análise',
  auditoria: 'Auditoria',
  configuracoes: 'Configurações',
  usuarios: 'Usuários',
  hierarquia: 'Hierarquia',
  tags: 'Tags',
  novo: 'Novo',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function Breadcrumb() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter((s) => s && !UUID_RE.test(s))

  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm min-w-0">
      {segments.map((segment, i) => {
        const label = ROUTE_LABELS[segment] ?? segment
        const isLast = i === segments.length - 1

        return (
          <span key={`${segment}-${i}`} className="flex items-center gap-1 min-w-0">
            {i > 0 && (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/40" />
            )}
            <span
              className={
                isLast
                  ? 'font-medium text-foreground truncate'
                  : 'text-muted-foreground truncate'
              }
            >
              {label}
            </span>
          </span>
        )
      })}
    </nav>
  )
}
