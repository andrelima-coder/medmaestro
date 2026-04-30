'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABELS, type UserRole } from '@/types'

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

export function UserMenu({
  fullName,
  email,
  role,
}: {
  fullName: string | null
  email: string | null
  role: UserRole
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const initials = getInitials(fullName, email)
  const displayName = fullName ?? email ?? 'Usuário'

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5 transition-colors"
        aria-label="Menu do usuário"
      >
        <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-[var(--mm-gold)] to-[var(--mm-gold2)] text-[10px] font-bold text-white shrink-0">
          {initials}
        </div>
        <div className="hidden md:flex flex-col leading-none text-left">
          <span className="text-xs font-medium text-foreground max-w-[120px] truncate">
            {displayName}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {ROLE_LABELS[role]}
          </span>
        </div>
        <svg
          width={12}
          height={12}
          viewBox="0 0 12 12"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            color: 'var(--mm-muted)',
          }}
        >
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            background: 'var(--mm-surface)',
            border: '1px solid var(--mm-line)',
            borderRadius: 10,
            padding: 6,
            minWidth: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 50,
          }}
        >
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid var(--mm-line)',
              marginBottom: 4,
            }}
          >
            <div className="text-xs font-medium text-foreground truncate">
              {displayName}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">{email}</div>
          </div>

          <Link
            href="/perfil"
            onClick={() => setOpen(false)}
            style={menuItemStyle}
            className="hover:bg-white/5"
          >
            Editar perfil
          </Link>
          <Link
            href="/perfil/senha"
            onClick={() => setOpen(false)}
            style={menuItemStyle}
            className="hover:bg-white/5"
          >
            Mudar senha
          </Link>
          <div
            style={{
              borderTop: '1px solid var(--mm-line)',
              margin: '4px 0',
            }}
          />
          <button
            onClick={handleLogout}
            style={{
              ...menuItemStyle,
              width: '100%',
              textAlign: 'left',
              color: '#EF5350',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            className="hover:bg-red-500/10"
          >
            Sair
          </button>
        </div>
      )}
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  padding: '8px 10px',
  fontSize: 12,
  color: 'var(--mm-text2)',
  textDecoration: 'none',
  borderRadius: 6,
  transition: 'background 0.1s',
}
