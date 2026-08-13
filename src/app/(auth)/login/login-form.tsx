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
    <div
      className={cn(
        'relative w-full max-w-[420px] rounded-[20px] p-11',
        'border border-[rgba(14,40,65,0.12)] bg-[rgba(255,255,255,0.88)] backdrop-blur-[24px]',
        'shadow-[0_32px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(123,63,160,0.10)]'
      )}
    >
      {/* Logo + título */}
      <div className="mb-8 text-center">
        <div
          className={cn(
            'mx-auto mb-3 flex size-[52px] items-center justify-center rounded-[14px]',
            'font-[family-name:var(--font-syne)] text-xl font-extrabold text-[#FFFFFF]',
            'shadow-[0_4px_24px_rgba(212,7,84,0.40)]'
          )}
          style={{
            background:
              'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))',
          }}
        >
          M
        </div>
        <h1 className="font-[family-name:var(--font-syne)] text-[22px] font-bold text-foreground">
          MedMaestro
        </h1>
        <p className="mt-1 text-[13px] text-[var(--mm-muted)]">
          Gestão de Provas e Questões TEMI
        </p>
      </div>

      {/* Divider luminoso (estende-se até as bordas do card via -mx-11) */}
      <div
        className="mb-7 -mx-11 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(123,63,160,0.30), rgba(212,7,84,0.30), transparent)',
        }}
      />

      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email"
            className="text-xs font-medium uppercase tracking-wide text-[var(--mm-text2)]"
          >
            E-mail institucional
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="seu@email.com"
            className={cn(
              'h-10 w-full rounded-lg border border-[var(--mm-border-default)] bg-[rgba(14,40,65,0.05)] px-3.5 text-sm text-foreground',
              'placeholder:text-muted-foreground/50',
              'outline-none transition-colors',
              'focus:border-[var(--mm-border-active)] focus:bg-[rgba(14,40,65,0.07)]'
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="text-xs font-medium uppercase tracking-wide text-[var(--mm-text2)]"
            >
              Senha
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-[var(--mm-gold)] hover:underline"
            >
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
                'h-10 w-full rounded-lg border border-[var(--mm-border-default)] bg-[rgba(14,40,65,0.05)] px-3.5 pr-10 text-sm text-foreground',
                'placeholder:text-muted-foreground/50',
                'outline-none transition-colors',
                'focus:border-[var(--mm-border-active)] focus:bg-[rgba(14,40,65,0.07)]'
              )}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mm-muted)] transition-colors hover:text-foreground"
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
            'mt-3 h-[46px] w-full rounded-lg text-sm font-semibold text-[#FFFFFF] tracking-[0.02em]',
            'transition-all',
            'hover:-translate-y-px',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0'
          )}
          style={{
            background:
              'linear-gradient(135deg, var(--mm-gold) 0%, var(--mm-gold2) 100%)',
            boxShadow:
              '0 4px 20px rgba(212,7,84,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          {isPending ? 'Entrando…' : 'Entrar na plataforma'}
        </button>

        <p className="mt-2 text-center text-xs text-[var(--mm-muted)]">
          Acesso restrito — somente usuários convidados.
        </p>
      </form>
    </div>
  )
}
