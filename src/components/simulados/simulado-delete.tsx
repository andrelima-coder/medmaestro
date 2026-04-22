'use client'

import { useState, useTransition } from 'react'
import { deleteSimuladoAction } from '@/app/(dashboard)/simulados/actions'

export function SimuladoDelete({ simuladoId }: { simuladoId: string }) {
  const [confirm, setConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="text-xs text-muted-foreground hover:text-red-400 transition-colors"
      >
        Excluir simulado
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Confirmar exclusão?</span>
      <button
        onClick={() =>
          startTransition(async () => {
            await deleteSimuladoAction(simuladoId)
          })
        }
        disabled={isPending}
        className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
      >
        {isPending ? 'Excluindo…' : 'Sim, excluir'}
      </button>
      <button
        onClick={() => setConfirm(false)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Cancelar
      </button>
    </div>
  )
}
