'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { forgotPasswordAction } from './actions'
import { cn } from '@/lib/utils'

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, null)

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Med<span className="text-[var(--mm-gold)]">Maestro</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Recuperação de senha</p>
      </div>

      <div
        className={cn(
          'rounded-xl border border-white/7 bg-[var(--mm-surface)]/80 backdrop-blur-md p-6',
          'shadow-[0_4px_32px_rgba(0,0,0,0.4)]'
        )}
      >
        {state?.success ? (
          <div className="text-center">
            <p className="text-sm text-foreground mb-1">E-mail enviado!</p>
            <p className="text-xs text-muted-foreground mb-6">
              Verifique sua caixa de entrada e clique no link para redefinir sua senha.
            </p>
            <Link href="/login" className="text-xs text-[var(--mm-gold)] hover:underline">
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Informe seu e-mail e enviaremos um link para redefinir sua senha.
            </p>

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
                  'placeholder:text-muted-foreground/50 outline-none transition-colors',
                  'focus:border-[var(--mm-gold)]/40 focus:bg-white/6'
                )}
              />
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
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isPending ? 'Enviando…' : 'Enviar link'}
            </button>

            <Link href="/login" className="text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
              Voltar ao login
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
