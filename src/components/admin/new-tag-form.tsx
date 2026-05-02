'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createTag } from '@/app/(dashboard)/configuracoes/tags/actions'
import { Card, CardBody } from '@/components/ui'

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
    <Card>
      <CardBody>
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex min-w-[180px] flex-1 flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--mm-muted)]">
              Label
            </label>
            <input
              name="label"
              required
              placeholder="Nome da tag"
              className="h-9 rounded-lg border border-[var(--mm-border-default)] bg-white/[0.04] px-3 text-sm text-foreground placeholder:text-[var(--mm-muted)] outline-none transition-colors hover:border-[var(--mm-border-hover)] focus:border-[var(--mm-border-active)] focus:bg-white/[0.07]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--mm-muted)]">
              Dimensão
            </label>
            <select
              name="dimension"
              required
              className="h-9 rounded-lg border border-[var(--mm-border-default)] bg-white/[0.04] px-3 text-sm text-foreground outline-none transition-colors hover:border-[var(--mm-border-hover)] focus:border-[var(--mm-border-active)]"
            >
              {DIMENSIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--mm-muted)]">
              Cor
            </label>
            <input
              type="color"
              name="color"
              defaultValue="#C9A84C"
              className="h-9 w-14 cursor-pointer rounded-lg border border-[var(--mm-border-default)] bg-transparent transition-colors hover:border-[var(--mm-border-hover)]"
            />
          </div>

          {error && (
            <p className="w-full text-[11px] text-[var(--mm-red)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-4 font-[family-name:var(--font-syne)] text-xs font-bold text-[#0A0A0A] transition-all hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50"
            style={{
              background:
                'linear-gradient(135deg, var(--mm-gold) 0%, var(--mm-orange) 100%)',
              boxShadow:
                '0 4px 20px rgba(201,120,30,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            <Plus className="size-3.5" />
            {isPending ? 'Criando…' : 'Nova tag'}
          </button>
        </form>
      </CardBody>
    </Card>
  )
}
