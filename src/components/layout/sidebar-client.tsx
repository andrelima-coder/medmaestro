'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  BookOpen,
  ClipboardCheck,
  Upload,
  FileText,
  BarChart2,
  Shield,
  Users,
  GitBranch,
  Tags,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Copy,
  Layers,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NavSectionDef } from './nav-config'

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  BookOpen,
  ClipboardCheck,
  Upload,
  FileText,
  BarChart2,
  Shield,
  Users,
  GitBranch,
  Tags,
  MessageSquare,
  Copy,
  Layers,
}

interface SidebarClientProps {
  sections: NavSectionDef[]
}

export function SidebarClient({ sections }: SidebarClientProps) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full border-r border-border bg-sidebar transition-[width] duration-200 ease-in-out shrink-0',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center px-4 border-b border-border shrink-0 overflow-hidden">
        {collapsed ? (
          <span className="text-lg font-bold text-[var(--mm-gold)]">M</span>
        ) : (
          <span className="text-base font-semibold text-foreground whitespace-nowrap">
            Med<span className="text-[var(--mm-gold)]">Maestro</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 space-y-5">
        {sections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = ICON_MAP[item.iconKey]
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors',
                        isActive
                          ? 'sidebar-item-active'
                          : 'text-sidebar-foreground hover:bg-white/[0.04] hover:text-foreground',
                        collapsed && 'justify-center'
                      )}
                    >
                      {Icon && <Icon className="size-4 shrink-0" />}
                      {!collapsed && (
                        <span className="whitespace-nowrap">{item.label}</span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        className={cn(
          'absolute -right-3 top-[4.5rem] z-10',
          'flex size-6 items-center justify-center rounded-full',
          'border border-border bg-sidebar text-muted-foreground',
          'hover:text-foreground hover:border-[var(--mm-gold)]/30 transition-colors'
        )}
      >
        {collapsed ? (
          <ChevronRight className="size-3" />
        ) : (
          <ChevronLeft className="size-3" />
        )}
      </button>
    </aside>
  )
}
