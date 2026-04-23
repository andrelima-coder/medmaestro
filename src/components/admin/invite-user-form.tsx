'use client'

import { useActionState, useRef } from 'react'
import { inviteUserAction } from '@/app/(dashboard)/configuracoes/usuarios/actions'

export function InviteUserForm() {
  const [state, action, isPending] = useActionState(inviteUserAction, null)
  const formRef = useRef<HTMLFormElement>(null)

  if (state?.ok) {
    // Reset form on success
    formRef.current?.reset()
  }

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <input
        name="email"
        type="email"
        placeholder="email@exemplo.com"
        required
        className="h-8 flex-1 rounded-lg border border-white/8 bg-[var(--mm-surface)] px-3 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
      />
      <button
        type="submit"
        disabled={isPending}
        className="h-8 px-3 rounded-lg border border-[var(--mm-gold)]/30 bg-[var(--mm-gold)]/10 hover:bg-[var(--mm-gold)]/20 text-xs text-[var(--mm-gold)] transition-colors disabled:opacity-50 shrink-0"
      >
        {isPending ? 'Enviando…' : 'Convidar'}
      </button>
      {state?.ok && (
        <span className="text-xs text-green-400 shrink-0">Convite enviado ✓</span>
      )}
      {state?.error && (
        <span className="text-xs text-destructive shrink-0">{state.error}</span>
      )}
    </form>
  )
}
