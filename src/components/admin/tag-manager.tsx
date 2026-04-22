'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateTag, toggleTagActive, reorderTag } from '@/app/(dashboard)/configuracoes/tags/actions'

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
    <div className="flex flex-col gap-6">
      {dimensions.map((dim) => {
        const dimTags = tags.filter((t) => t.dimension === dim)
        return (
          <div key={dim} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {DIMENSION_LABELS[dim] ?? dim}
              <span className="ml-2 text-white/30 font-normal normal-case">
                {dimTags.filter((t) => t.is_active).length}/{dimTags.length} ativas
              </span>
            </h3>

            <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm overflow-hidden">
              {dimTags.map((tag, i) => (
                <div
                  key={tag.id}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0 ${
                    !tag.is_active ? 'opacity-40' : ''
                  }`}
                >
                  {/* Color swatch */}
                  <div
                    className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                    style={{ backgroundColor: tag.color ?? '#888' }}
                  />

                  {editingId === tag.id ? (
                    /* Modo edição */
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="h-7 flex-1 rounded-md border border-white/15 bg-white/5 px-2 text-xs text-foreground outline-none focus:border-[var(--mm-gold)]/40"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(tag.id)
                          if (e.key === 'Escape') cancelEdit()
                        }}
                      />
                      <input
                        type="color"
                        value={editColor || '#888888'}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="w-7 h-7 rounded-md border border-white/15 bg-transparent cursor-pointer"
                        title="Cor da tag"
                      />
                      <button
                        onClick={() => saveEdit(tag.id)}
                        disabled={isPending}
                        className="text-xs text-green-400 hover:text-green-300 transition-colors disabled:opacity-40"
                      >
                        Salvar
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    /* Modo visualização */
                    <>
                      <span className="text-sm text-foreground flex-1 truncate">{tag.label}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Reordenar */}
                        <button
                          onClick={() => handleReorder(tag.id, 'up')}
                          disabled={isPending || i === 0}
                          className="w-6 h-6 flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-20"
                          title="Mover para cima"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => handleReorder(tag.id, 'down')}
                          disabled={isPending || i === dimTags.length - 1}
                          className="w-6 h-6 flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-20"
                          title="Mover para baixo"
                        >
                          ↓
                        </button>
                        {/* Editar */}
                        <button
                          onClick={() => startEdit(tag)}
                          disabled={isPending}
                          className="px-2 h-6 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                        >
                          Editar
                        </button>
                        {/* Toggle ativo */}
                        <button
                          onClick={() => handleToggle(tag.id, tag.is_active)}
                          disabled={isPending}
                          className={`px-2 h-6 text-xs transition-colors disabled:opacity-40 ${
                            tag.is_active
                              ? 'text-muted-foreground hover:text-red-400'
                              : 'text-muted-foreground hover:text-green-400'
                          }`}
                        >
                          {tag.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
