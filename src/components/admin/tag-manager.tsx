'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown } from 'lucide-react'
import {
  updateTag,
  toggleTagActive,
  reorderTag,
} from '@/app/(dashboard)/configuracoes/tags/actions'
import { Card, CardBody, CardHeader, CardTitle, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface TagRow {
  id: string
  label: string
  color: string | null
  dimension: string
  display_order: number
  is_active: boolean
}

interface TagManagerProps {
  tags: TagRow[]
}

const DIMENSION_LABELS: Record<string, string> = {
  modulo: 'Módulo',
  dificuldade: 'Dificuldade',
  tipo_questao: 'Tipo de Questão',
  recurso_visual: 'Recurso Visual',
}

const DIMENSION_GLOW: Record<
  string,
  'gold' | 'purple' | 'orange' | 'none'
> = {
  modulo: 'gold',
  dificuldade: 'gold',
  tipo_questao: 'purple',
  recurso_visual: 'orange',
}

const inputClass =
  'h-8 flex-1 rounded-lg border border-[var(--mm-border-default)] bg-white/[0.04] px-2.5 text-xs text-foreground outline-none transition-colors hover:border-[var(--mm-border-hover)] focus:border-[var(--mm-border-active)] focus:bg-white/[0.07]'

const btnGhostClass =
  'inline-flex h-7 items-center rounded-md border border-[var(--mm-border-default)] bg-transparent px-2.5 text-[11px] text-[var(--mm-text2)] transition-colors hover:border-[var(--mm-border-hover)] hover:text-foreground disabled:pointer-events-none disabled:opacity-40'

const btnDangerInlineClass =
  'inline-flex h-7 items-center rounded-md border border-[rgba(239,83,80,0.30)] bg-[rgba(239,83,80,0.08)] px-2.5 text-[11px] text-[var(--mm-red)] transition-colors hover:bg-[rgba(239,83,80,0.18)] disabled:opacity-50'

const btnSuccessInlineClass =
  'inline-flex h-7 items-center rounded-md border border-[rgba(102,187,106,0.30)] bg-[rgba(102,187,106,0.08)] px-2.5 text-[11px] text-[var(--mm-green)] transition-colors hover:bg-[rgba(102,187,106,0.18)] disabled:opacity-50'

const iconBtnClass =
  'flex size-6 items-center justify-center rounded text-[var(--mm-muted)] transition-colors hover:bg-white/[0.04] hover:text-foreground disabled:opacity-20 disabled:pointer-events-none'

export function TagManager({ tags }: TagManagerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('')

  const dimensions = [...new Set(tags.map((t) => t.dimension))]

  function startEdit(tag: TagRow) {
    setEditingId(tag.id)
    setEditLabel(tag.label)
    setEditColor(tag.color ?? '')
  }

  function cancelEdit() {
    setEditingId(null)
  }

  function saveEdit(id: string) {
    startTransition(async () => {
      await updateTag(id, {
        label: editLabel.trim(),
        color: editColor.trim() || null,
      })
      setEditingId(null)
      router.refresh()
    })
  }

  function handleToggle(id: string, current: boolean) {
    startTransition(async () => {
      await toggleTagActive(id, !current)
      router.refresh()
    })
  }

  function handleReorder(id: string, dir: 'up' | 'down') {
    startTransition(async () => {
      await reorderTag(id, dir)
      router.refresh()
    })
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {dimensions.map((dim) => {
        const dimTags = tags.filter((t) => t.dimension === dim)
        const activeCount = dimTags.filter((t) => t.is_active).length
        const glow = DIMENSION_GLOW[dim] ?? 'none'

        return (
          <Card key={dim} glow={glow}>
            <CardHeader>
              <div className="flex min-w-0 items-center gap-2.5">
                {/* Color seal — toma a cor da primeira tag ativa da dimensão */}
                <div
                  className="size-2.5 flex-shrink-0 rounded-sm"
                  style={{
                    background:
                      dimTags.find((t) => t.color)?.color ?? 'var(--mm-muted)',
                  }}
                />
                <CardTitle>{DIMENSION_LABELS[dim] ?? dim}</CardTitle>
              </div>
              <Badge tone={glow === 'none' ? 'muted' : (glow as 'gold' | 'purple' | 'orange')}>
                {activeCount}/{dimTags.length}
              </Badge>
            </CardHeader>
            <CardBody className="flex flex-col gap-1.5">
              {dimTags.map((tag, i) => (
                <div
                  key={tag.id}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border border-[var(--mm-border-default)] bg-white/[0.02] px-3 py-2 transition-colors',
                    !tag.is_active && 'opacity-40',
                    tag.is_active && 'hover:border-[var(--mm-border-hover)]'
                  )}
                >
                  {/* Color swatch */}
                  <div
                    className="size-3 flex-shrink-0 rounded-full border border-white/20"
                    style={{ backgroundColor: tag.color ?? '#525E76' }}
                  />

                  {editingId === tag.id ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className={inputClass}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(tag.id)
                          if (e.key === 'Escape') cancelEdit()
                        }}
                      />
                      <input
                        type="color"
                        value={editColor || '#525E76'}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="size-7 cursor-pointer rounded-md border border-[var(--mm-border-default)] bg-transparent transition-colors hover:border-[var(--mm-border-hover)]"
                        title="Cor da tag"
                      />
                      <button
                        onClick={() => saveEdit(tag.id)}
                        disabled={isPending}
                        className={btnSuccessInlineClass}
                      >
                        Salvar
                      </button>
                      <button onClick={cancelEdit} className={btnGhostClass}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-sm text-foreground">
                        {tag.label}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => handleReorder(tag.id, 'up')}
                          disabled={isPending || i === 0}
                          className={iconBtnClass}
                          title="Mover para cima"
                          aria-label="Mover para cima"
                        >
                          <ChevronUp className="size-3.5" />
                        </button>
                        <button
                          onClick={() => handleReorder(tag.id, 'down')}
                          disabled={isPending || i === dimTags.length - 1}
                          className={iconBtnClass}
                          title="Mover para baixo"
                          aria-label="Mover para baixo"
                        >
                          <ChevronDown className="size-3.5" />
                        </button>
                        <button
                          onClick={() => startEdit(tag)}
                          disabled={isPending}
                          className={btnGhostClass}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleToggle(tag.id, tag.is_active)}
                          disabled={isPending}
                          className={
                            tag.is_active
                              ? btnDangerInlineClass
                              : btnSuccessInlineClass
                          }
                        >
                          {tag.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {dimTags.length === 0 && (
                <p className="py-3 text-center text-[11px] text-[var(--mm-muted)]">
                  Nenhuma tag nesta dimensão.
                </p>
              )}
            </CardBody>
          </Card>
        )
      })}
    </div>
  )
}
