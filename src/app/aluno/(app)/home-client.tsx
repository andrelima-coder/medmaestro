'use client'

import { useState, useTransition } from 'react'
import { setGoalAction } from './actions'

export function GoalSetter({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  return (
    <div className="mt-1 flex items-center gap-2">
      <input
        type="number"
        min={1}
        max={500}
        value={value}
        onChange={(e) => {
          setValue(Number(e.target.value))
          setSaved(false)
        }}
        className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm"
      />
      <button
        onClick={() =>
          startTransition(async () => {
            const r = await setGoalAction(value)
            if (r.ok) setSaved(true)
          })
        }
        disabled={isPending}
        className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saved ? 'Salvo' : 'Salvar'}
      </button>
    </div>
  )
}
