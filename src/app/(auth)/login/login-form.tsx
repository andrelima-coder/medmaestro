'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { loginAction } from './actions'
import { cn } from '@/lib/utils'

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, null)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="w-full max-w-sm">
      {/* Logo / título */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Med<span className="text-[var(--mm-gold)]">Maestro</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sistema de gestão de banco de provas baseados e dados — By André Lima
        </p>
      </div>

      {/* Card glass */}
      <div
        className={cn(
          'rounded-xl border border-white/7 bg-[var(--mm-surface)]/80 backdrop-blur-md p-6',
          'shadow-[0_4px_32px_rgba(0,0,0,0.4)]'
        )}
      >
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="seu@email.com"
              className={cn(
                'h-10 w-full rounded-lg border border-white/8 bg-white/4 px-3 text-sm text-foreground',
                'placeholder:text-muted-foreground/50',
                'outline-none transition-colors',
                'focus:border-[var(--mm-gold)]/40 focus:bg-white/6',
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Senha
              </label>
              <Link href="/forgot-password" className="text-xs text-[var(--mm-gold)] hover:underline">
                Esqueceu a senha?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className={cn(
                  'h-10 w-full rounded-lg border border-white/8 bg-white/4 px-3 pr-10 text-sm text-foreground',
                  'placeholder:text-muted-foreground/50',
                  'outline-none transition-colors',
                  'focus:border-[var(--mm-gold)]/40 focus:bg-white/6',
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {state?.error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className={cn(
              'mt-1 h-10 w-full rounded-lg text-sm font-medium text-white',
              'bg-gradient-to-r from-[var(--mm-gold)] to-[var(--mm-orange)]',
              'transition-opacity hover:opacity-90 active:opacity-80',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isPending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
