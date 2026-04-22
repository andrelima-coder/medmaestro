'use client'

import { useState, useTransition } from 'react'
import { changeUserRole } from '@/app/(dashboard)/configuracoes/usuarios/actions'

const ROLES = ['analista', 'professor', 'admin', 'superadmin'] as const
type Role = typeof ROLES[number]

const ROLE_LABELS: Record<Role, string> = {
  analista: 'Analista',
  professor: 'Professor',
  admin: 'Admin',
  superadmin: 'Superadmin',
}

const ROLE_COLORS: Record<Role, string> = {
  analista: 'text-muted-foreground',
  professor: 'text-blue-400',
  admin: 'text-[var(--mm-gold)]',
  superadmin: 'text-red-400',
}

export function UserRoleSelect({
  userId,
  currentRole,
  callerRole,
}: {
  userId: string
  currentRole: Role
  callerRole: Role
}) {
  const [role, setRole] = useState(currentRole)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const callerRank = ['analista', 'professor', 'admin', 'superadmin'].indexOf(callerRole)

  const handleChange = (newRole: Role) => {
    if (newRole === role) return
    setError('')
    startTransition(async () => {
      const res = await changeUserRole(userId, newRole)
      if (res.ok) setRole(newRole)
      else setError(res.error ?? 'Erro')
    })
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={role}
        onChange={(e) => handleChange(e.target.value as Role)}
        disabled={isPending}
        className={`h-7 rounded border border-white/8 bg-[var(--mm-surface)] px-2 text-xs outline-none transition-colors disabled:opacity-50 ${ROLE_COLORS[role]}`}
      >
        {ROLES.map((r) => {
          const rRank = ['analista', 'professor', 'admin', 'superadmin'].indexOf(r)
          const disabled = callerRank < 3 && rRank >= 3
          return (
            <option key={r} value={r} disabled={disabled}>
              {ROLE_LABELS[r]}
            </option>
          )
        })}
      </select>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
