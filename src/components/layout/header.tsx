import { Breadcrumb } from './breadcrumb'
import { HeaderSearch } from './header-search'
import { UserMenu } from './user-menu'
import { type UserRole } from '@/types'

interface HeaderProps {
  fullName: string | null
  email: string | null
  role: UserRole
}

export function Header({ fullName, email, role }: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-5 shrink-0 gap-4">
      <div className="min-w-0 flex-1">
        <Breadcrumb />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <HeaderSearch />
        <UserMenu fullName={fullName} email={email} role={role} />
      </div>
    </header>
  )
}
