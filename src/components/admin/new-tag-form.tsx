'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTag } from '@/app/(dashboard)/configuracoes/tags/actions'

const DIMENSIONS = [
  { value: 'modulo', label: 'Módulo' },
  { value: 'dificuldade', label: 'Dificuldade' },
  { value: 'tipo_questao', label: 'Tipo de Questão' },
  { value: 'recurso_visual', label: 'Recurso Visual' },
]

export function NewTagForm() {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await createTag(fd)
      if (result.ok) {
        formRef.current?.reset()
        router.refresh()
      } else {
        setError(result.error ?? 'Erro desconhecido')
      }
    })
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-4 flex flex-wrap gap-3 items-end"
    >
      <div className="flex flex-col gap-1 flex-1 min-w-36">
        <label className="text-xs text-muted-foreground">Label</label>
        <input
          name="label"
          required
          placeholder="Nome da tag"
          className="h-9 rounded-lg border border-white/8 bg-white/4 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Dimensão</label>
        <select
          name="dimension"
          required
          className="h-9 rounded-lg border border-white/8 bg-[var(--mm-surface)] px-3 text-sm text-foreground outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
        >
          {DIMENSIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Cor</label>
        <input
          type="color"
          name="color"
          defaultValue="#888888"
          className="h-9 w-14 rounded-lg border border-white/8 bg-transparent cursor-pointer"
        />
      </div>

      {error && <p className="w-full text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-4 rounded-lg border border-[var(--mm-gold)]/30 bg-[var(--mm-gold)]/10 text-xs font-medium text-[var(--mm-gold)] hover:bg-[var(--mm-gold)]/20 transition-colors disabled:opacity-40"
      >
        {isPending ? 'Criando…' : '+ Nova tag'}
      </button>
    </form>
  )
}
