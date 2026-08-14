'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Calendar,
  Timer,
  LayoutGrid,
  Target,
  FileText,
  RotateCcw,
  Layers,
  Activity,
  Flag,
  Settings,
  LogOut,
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
  { label: 'Agenda', href: '/aluno/agenda', icon: Calendar, emBreve: true },
  { label: 'Foco', href: '/aluno/foco', icon: Timer, emBreve: true },
]

const ESTUDO: NavItem[] = [
  { label: 'Módulos', href: '/aluno/modulos', icon: LayoutGrid, emBreve: true },
  { label: 'Praticar', href: '/aluno/praticar', icon: Target },
  { label: 'Simulados', href: '/aluno/simulados', icon: FileText, emBreve: true },
  { label: 'Revisão de erros', href: '/aluno/revisao', icon: RotateCcw },
  { label: 'Flashcards', href: '/aluno/flashcards', icon: Layers, emBreve: true },
  { label: 'Desempenho', href: '/aluno/desempenho', icon: Activity },
  { label: 'Metas', href: '/aluno/metas', icon: Flag, emBreve: true },
]

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

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

export function AlunoSidebar({
  userName,
  userSub,
}: {
  userName: string
  userSub: string
}) {
  const pathname = usePathname()
  const iniciais = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'A'

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[rgba(14,40,65,0.10)] bg-white">
      {/* Marca */}
      <div className="flex items-center gap-2.5 px-4 py-5">
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

      {/* Nav topo */}
      <nav className="space-y-0.5 px-2">
        {TOPO.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      {/* Grupo Estudo */}
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

      {/* Rodapé */}
      <div className="mt-auto space-y-0.5 border-t border-[rgba(14,40,65,0.10)] px-2 pt-3 pb-2">
        <div
          className="flex cursor-not-allowed items-center gap-3 rounded-lg px-2 py-2 text-sm text-muted-foreground/40"
          title="Em breve"
        >
          <Settings className="size-4 shrink-0" />
          <span>Configurações</span>
        </div>
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
    </aside>
  )
}
