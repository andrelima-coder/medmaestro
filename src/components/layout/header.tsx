import { Breadcrumb } from './breadcrumb'
import { HeaderSearch } from './header-search'
import { LogoutButton } from './logout-button'
import { ROLE_LABELS, type UserRole } from '@/types'

interface HeaderProps {
  fullName: string | null
  email: string | null
  role: UserRole
}

function getInitials(fullName: string | null, email: string | null): string {
  if (fullName) {
    return fullName
      .split(' ')
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
  }
  return (email?.[0] ?? 'U').toUpperCase()
}

export function Header({ fullName, email, role }: HeaderProps) {
  const initials = getInitials(fullName, email)
  const displayName = fullName ?? email ?? 'Usuário'

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-5 shrink-0 gap-4">
      <div className="min-w-0 flex-1">
        <Breadcrumb />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <HeaderSearch />

        {/* Avatar + nome */}
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-[var(--mm-gold)] to-[var(--mm-orange)] text-[10px] font-bold text-white shrink-0">
            {initials}
          </div>
          <div className="hidden md:flex flex-col leading-none">
            <span className="text-xs font-medium text-foreground max-w-[120px] truncate">
              {displayName}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {ROLE_LABELS[role]}
            </span>
          </div>
        </div>

        <LogoutButton />
      </div>
    </header>
  )
}
