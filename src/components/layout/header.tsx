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
    <header
      className={[
        'relative flex h-14 items-center justify-between gap-4 px-5 shrink-0',
        'bg-[linear-gradient(180deg,rgba(14,11,28,0.96)_0%,rgba(10,8,22,0.92)_100%)]',
        'border-b border-[rgba(255,255,255,0.06)] backdrop-blur-md',
        "after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px",
        'after:bg-[linear-gradient(90deg,transparent,rgba(139,92,246,0.20),rgba(201,168,76,0.15),transparent)]',
      ].join(' ')}
    >
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
