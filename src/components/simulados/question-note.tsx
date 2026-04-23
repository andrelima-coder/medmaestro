'use client'

import { useRef, useState, useTransition } from 'react'
import { updateSimuladoQuestionNote } from '@/app/(dashboard)/simulados/actions'

export function QuestionNote({
  simuladoId,
  sqId,
  initialNote,
}: {
  simuladoId: string
  sqId: string
  initialNote: string | null
}) {
  const [note, setNote] = useState(initialNote ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [isPending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleChange = (val: string) => {
    setNote(val)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      startTransition(async () => {
        setSaveState('saving')
        const res = await updateSimuladoQuestionNote(simuladoId, sqId, val)
        if (res.ok) {
          setSaveState('saved')
          setTimeout(() => setSaveState('idle'), 2000)
        } else {
          setSaveState('error')
          setTimeout(() => setSaveState('idle'), 3000)
        }
      })
    }, 800)
  }

  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={note}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        placeholder="Nota do professor (opcional)…"
        rows={2}
        className="w-full resize-none rounded-lg border border-white/8 bg-white/3 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-[var(--mm-gold)]/30 transition-colors disabled:opacity-50"
      />
      <div className="h-3 text-right">
        {saveState === 'saving' && (
          <span className="text-[10px] text-muted-foreground animate-pulse">Salvando…</span>
        )}
        {saveState === 'saved' && (
          <span className="text-[10px] text-green-400">Salvo ✓</span>
        )}
        {saveState === 'error' && (
          <span className="text-[10px] text-destructive">Erro ao salvar</span>
        )}
      </div>
    </div>
  )
}
