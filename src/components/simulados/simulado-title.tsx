'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateSimuladoTitle } from '@/app/(dashboard)/simulados/actions'

interface SimuladoTitleProps {
  simuladoId: string
  initialTitle: string
}

export function SimuladoTitle({ simuladoId, initialTitle }: SimuladoTitleProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialTitle)
  const [saved, setSaved] = useState(initialTitle)
  const [isPending, startTransition] = useTransition()

  function save() {
    if (!value.trim() || value.trim() === saved) {
      setValue(saved)
      setEditing(false)
      return
    }
    startTransition(async () => {
      const result = await updateSimuladoTitle(simuladoId, value.trim())
      if (result.ok) {
        setSaved(value.trim())
        router.refresh()
      } else {
        setValue(saved)
      }
      setEditing(false)
    })
  }

  if (editing) {
    return (
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') { setValue(saved); setEditing(false) }
        }}
        autoFocus
        disabled={isPending}
        className="text-xl font-semibold text-foreground bg-transparent border-b border-[var(--mm-gold)]/40 outline-none w-full max-w-lg"
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xl font-semibold text-foreground text-left hover:text-foreground/80 transition-colors group"
      title="Clique para editar"
    >
      {saved}
      <span className="ml-2 text-xs text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity">
        ✎
      </span>
    </button>
  )
}
