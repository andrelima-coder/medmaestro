'use client'

import { LogOut } from 'lucide-react'
import { useTransition } from 'react'
import { logoutAction } from '@/app/(dashboard)/actions'

export function LogoutButton() {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(() => logoutAction())}
      disabled={isPending}
      aria-label="Sair"
      className="flex items-center justify-center size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors disabled:opacity-50"
    >
      <LogOut className="size-4" />
    </button>
  )
}
