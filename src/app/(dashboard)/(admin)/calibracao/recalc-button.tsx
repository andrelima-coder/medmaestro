'use client'

import { useState, useTransition } from 'react'
import { recalcCalibrationAction } from './actions'

export function RecalcButton() {
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() =>
          startTransition(async () => {
            const res = await recalcCalibrationAction()
            setMsg(res.ok ? 'Calibração recalculada.' : res.error ?? 'Falha.')
          })
        }
        disabled={isPending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {isPending ? 'Recalculando…' : 'Recalcular agora'}
      </button>
      {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
    </div>
  )
}
