'use client'

import { useActionState, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { resetPasswordAction } from './actions'
import { cn } from '@/lib/utils'

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(resetPasswordAction, null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Med<span className="text-[var(--mm-gold)]">Maestro</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Criar nova senha</p>
      </div>

      <div
        className={cn(
          'rounded-xl border border-white/7 bg-[var(--mm-surface)]/80 backdrop-blur-md p-6',
          'shadow-[0_4px_32px_rgba(0,0,0,0.4)]'
        )}
      >
        <form action={formAction} className="flex flex-col gap-4">
          <PasswordField
            id="password"
            label="Nova senha"
            show={showPassword}
            onToggle={() => setShowPassword(v => !v)}
          />
          <PasswordField
            id="confirm"
            label="Confirmar senha"
            show={showConfirm}
            onToggle={() => setShowConfirm(v => !v)}
          />

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
              'bg-gradient-to-r from-[var(--mm-gold)] to-[var(--mm-gold2)]',
              'transition-opacity hover:opacity-90 active:opacity-80',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isPending ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  )
}

function PasswordField({
  id,
  label,
  show,
  onToggle,
}: {
  id: string
  label: string
  show: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={show ? 'text' : 'password'}
          required
          minLength={8}
          placeholder="••••••••"
          className={cn(
            'h-10 w-full rounded-lg border border-white/8 bg-white/4 px-3 pr-10 text-sm text-foreground',
            'placeholder:text-muted-foreground/50 outline-none transition-colors',
            'focus:border-[var(--mm-gold)]/40 focus:bg-white/6'
          )}
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}
