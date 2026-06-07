'use client'

import { useState, useTransition } from 'react'
import { resolveGabaritoFlag } from './actions'

export type FlagItem = { id: string; reason: string; questionNo: number | null }

export function FlagsList({ flags }: { flags: FlagItem[] }) {
  const [items, setItems] = useState(flags)
  const [isPending, startTransition] = useTransition()

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum candidato a erro de gabarito em aberto.</p>
  }

  return (
    <ul className="space-y-2">
      {items.map((f) => (
        <li
          key={f.id}
          className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
        >
          <span className="text-foreground">
            <strong>Questão {f.questionNo ?? '—'}:</strong> {f.reason}
          </span>
          <button
            onClick={() =>
              startTransition(async () => {
                const res = await resolveGabaritoFlag(f.id)
                if (res.ok) setItems((prev) => prev.filter((x) => x.id !== f.id))
              })
            }
            disabled={isPending}
            className="rounded-md border border-border px-3 py-1 text-xs text-foreground"
          >
            Marcar como revisado
          </button>
        </li>
      ))}
    </ul>
  )
}
