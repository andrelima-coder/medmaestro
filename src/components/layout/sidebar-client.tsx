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
  Paperclip,
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
  Paperclip,
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
        'relative flex flex-col h-full transition-[width] duration-200 ease-in-out shrink-0',
        'border-r border-[rgba(139,92,246,0.10)]',
        'bg-[linear-gradient(180deg,rgba(12,9,26,0.98)_0%,rgba(9,7,20,0.98)_100%)]',
        'shadow-[inset_-1px_0_0_rgba(139,92,246,0.06)]',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-border shrink-0 overflow-hidden">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-lg font-[family-name:var(--font-syne)] text-sm font-extrabold text-[#0A0A0A]"
          style={{
            background:
              'linear-gradient(135deg, var(--mm-gold), var(--mm-orange))',
          }}
        >
          M
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight">
            <span className="text-base font-semibold text-foreground whitespace-nowrap font-[family-name:var(--font-syne)]">
              Med<span className="text-[var(--mm-gold)]">Maestro</span>
            </span>
            <span className="text-[9px] text-muted-foreground/70 whitespace-nowrap tracking-wider uppercase">
              by André Lima
            </span>
          </div>
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
