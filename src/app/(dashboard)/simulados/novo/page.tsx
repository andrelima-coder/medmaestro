'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { createSimuladoAction } from '../actions'

export default function NovoSimuladoPage() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string }, formData: FormData) => {
      return (await createSimuladoAction(formData)) ?? {}
    },
    {}
  )

  return (
    <div className="aurora-bg flex flex-col gap-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Link
          href="/simulados"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Simulados
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-foreground">Novo simulado</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Crie o simulado e adicione questões na próxima etapa.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Título</label>
            <input
              name="title"
              required
              autoFocus
              placeholder="Ex: Simulado TEMI 2024 — Módulo Cardiologia"
              className="h-10 rounded-lg border border-white/8 bg-white/4 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
            />
          </div>

          {state?.error && (
            <p className="text-xs text-red-400">{state.error}</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg border border-[var(--mm-gold)]/30 bg-[var(--mm-gold)]/10 px-5 py-2.5 text-sm font-medium text-[var(--mm-gold)] hover:bg-[var(--mm-gold)]/20 transition-colors disabled:opacity-40"
          >
            {isPending ? 'Criando…' : 'Criar simulado →'}
          </button>
          <Link
            href="/simulados"
            className="rounded-lg border border-white/8 px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
