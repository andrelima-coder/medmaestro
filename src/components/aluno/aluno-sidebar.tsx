'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Calendar,
  Timer,
  Brain,
  LayoutGrid,
  Target,
  FileText,
  RotateCcw,
  Layers,
  Activity,
  TrendingUp,
  Flag,
  Settings,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { logoutAluno } from '@/app/aluno/(app)/actions'

type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  emBreve?: boolean
}

const TOPO: NavItem[] = [
  { label: 'Início', href: '/aluno', icon: Home },
  { label: 'Revisar', href: '/aluno/revisar', icon: Brain },
  { label: 'Flashcards', href: '/aluno/flashcards', icon: Layers },
  { label: 'Agenda', href: '/aluno/agenda', icon: Calendar },
  { label: 'Foco', href: '/aluno/foco', icon: Timer },
]

const ESTUDO: NavItem[] = [
  { label: 'Módulos', href: '/aluno/modulos', icon: LayoutGrid },
  { label: 'Praticar', href: '/aluno/praticar', icon: Target },
  { label: 'Simulados', href: '/aluno/simulados', icon: FileText },
  { label: 'Revisão de erros', href: '/aluno/revisao', icon: RotateCcw },
  { label: 'Desempenho', href: '/aluno/desempenho', icon: Activity },
  { label: 'Evolução', href: '/aluno/evolucao', icon: TrendingUp },
  { label: 'Metas', href: '/aluno/metas', icon: Flag },
]

// Conta de lead (porta pública): apenas a superfície de Simulados.
const LEAD_ITEMS: NavItem[] = [{ label: 'Simulados', href: '/aluno/simulados', icon: FileText }]

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon
  const isActive =
    pathname === item.href || (item.href !== '/aluno' && pathname.startsWith(item.href + '/'))

  if (item.emBreve) {
    return (
      <div
        className="flex cursor-not-allowed items-center gap-3 rounded-lg px-2 py-2 text-sm text-muted-foreground/40"
        title="Em breve"
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 whitespace-nowrap">{item.label}</span>
        <span className="whitespace-nowrap rounded-full bg-[var(--mm-gray-100,#F4F6F9)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/50">
          em breve
        </span>
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors',
        isActive
          ? 'sidebar-item-active'
          : 'text-sidebar-foreground hover:bg-[rgba(14,40,65,0.04)] hover:text-foreground'
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="whitespace-nowrap">{item.label}</span>
    </Link>
  )
}

function Brand({ userSub }: { userSub: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold text-white"
        style={{ background: 'linear-gradient(135deg, var(--afya-magenta), var(--afya-magenta-deep))' }}
      >
        MM
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-[15px] font-extrabold text-[var(--afya-navy)]">
          Med<span style={{ color: 'var(--afya-magenta)' }}>Maestro</span>
        </span>
        <span className="text-[11px] font-semibold text-muted-foreground">{userSub}</span>
      </div>
    </div>
  )
}

function SidebarContent({
  userName,
  userSub,
  restrito,
  pathname,
}: {
  userName: string
  userSub: string
  restrito: boolean
  pathname: string
}) {
  const iniciais =
    userName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || 'A'

  return (
    <>
      {/* Nav */}
      {restrito ? (
        <div className="px-2">
          <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
            Simulado
          </p>
          <nav className="space-y-0.5">
            {LEAD_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>
        </div>
      ) : (
        <>
          <nav className="space-y-0.5 px-2">
            {TOPO.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>
          <div className="mt-3 px-2">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Estudo
            </p>
            <nav className="space-y-0.5">
              {ESTUDO.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </nav>
          </div>
        </>
      )}

      {/* Rodapé */}
      <div className="mt-auto space-y-0.5 border-t border-[rgba(14,40,65,0.10)] px-2 pt-3 pb-2">
        {!restrito && (
          <NavLink
            item={{ label: 'Configurações', href: '/aluno/configuracoes', icon: Settings }}
            pathname={pathname}
          />
        )}
        <form action={logoutAluno}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-[rgba(14,40,65,0.04)] hover:text-foreground"
          >
            <LogOut className="size-4 shrink-0" />
            <span>Sair</span>
          </button>
        </form>
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold"
            style={{ background: 'var(--afya-pink-tint)', color: 'var(--afya-magenta-deep)' }}
          >
            {iniciais}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-bold text-[var(--afya-navy)]">{userName}</div>
            <div className="truncate text-[11px] text-muted-foreground">{userSub}</div>
          </div>
        </div>
      </div>
    </>
  )
}

export function AlunoSidebar({
  userName,
  userSub,
  restrito = false,
}: {
  userName: string
  userSub: string
  restrito?: boolean
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Fecha o drawer ao navegar.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <>
      {/* Barra superior mobile */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-[rgba(14,40,65,0.10)] bg-white px-3 md:hidden">
        <Brand userSub={userSub} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="flex size-10 items-center justify-center rounded-lg text-foreground hover:bg-[rgba(14,40,65,0.04)]"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-[rgba(14,40,65,0.4)]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-4">
              <Brand userSub={userSub} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="flex size-10 items-center justify-center rounded-lg text-foreground hover:bg-[rgba(14,40,65,0.04)]"
              >
                <X className="size-5" />
              </button>
            </div>
            <SidebarContent
              userName={userName}
              userSub={userSub}
              restrito={restrito}
              pathname={pathname}
            />
          </aside>
        </div>
      )}

      {/* Sidebar desktop */}
      <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-[rgba(14,40,65,0.10)] bg-white md:flex">
        <div className="px-4 py-5">
          <Brand userSub={userSub} />
        </div>
        <SidebarContent
          userName={userName}
          userSub={userSub}
          restrito={restrito}
          pathname={pathname}
        />
      </aside>
    </>
  )
}
