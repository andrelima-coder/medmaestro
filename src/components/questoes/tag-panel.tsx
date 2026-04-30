'use client'

import { useState, useTransition, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { saveQuestionTags, undoLastTagEdit } from '@/app/(dashboard)/questoes/[id]/actions'

export interface TagItem {
  id: string
  label: string
  color: string | null
  dimension: string
}

interface TagPanelProps {
  questionId: string
  allTags: TagItem[]
  currentTagIds: string[]
  hasUndoableRevision: boolean
}

const DIMENSION_LABELS: Record<string, string> = {
  modulo: 'Módulo',
  dificuldade: 'Dificuldade',
  tipo_questao: 'Tipo de Questão',
  recurso_visual: 'Recurso Visual',
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function TagPanel({
  questionId,
  allTags,
  currentTagIds,
  hasUndoableRevision,
}: TagPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeTags, setActiveTags] = useState(() => new Set(currentTagIds))
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [canUndo, setCanUndo] = useState(hasUndoableRevision)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const triggerSave = useCallback(
    (tagIds: string[]) => {
      clearTimeout(saveTimer.current)
      setSaveState('saving')
      saveTimer.current = setTimeout(() => {
        startTransition(async () => {
          const result = await saveQuestionTags(questionId, tagIds)
          if (result.ok) {
            setSaveState('saved')
            setCanUndo(true)
            setTimeout(() => setSaveState('idle'), 2000)
          } else {
            setSaveState('error')
            setTimeout(() => setSaveState('idle'), 3000)
          }
        })
      }, 600)
    },
    [questionId]
  )

  function toggleTag(tagId: string) {
    setActiveTags((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) {
        next.delete(tagId)
      } else {
        next.add(tagId)
      }
      triggerSave([...next])
      return next
    })
  }

  function handleUndo() {
    startTransition(async () => {
      setSaveState('saving')
      const result = await undoLastTagEdit(questionId)
      if (result.ok) {
        setSaveState('saved')
        setCanUndo(false)
        setTimeout(() => setSaveState('idle'), 1500)
        router.refresh()
      } else {
        setSaveState('error')
        setTimeout(() => setSaveState('idle'), 3000)
      }
    })
  }

  // Agrupa por dimensão
  const tagsByDimension = allTags.reduce<Record<string, TagItem[]>>((acc, tag) => {
    if (!acc[tag.dimension]) acc[tag.dimension] = []
    acc[tag.dimension].push(tag)
    return acc
  }, {})

  const dimensionOrder = ['modulo', 'dificuldade', 'tipo_questao', 'recurso_visual']
  const orderedDimensions = [
    ...dimensionOrder.filter((d) => d in tagsByDimension),
    ...Object.keys(tagsByDimension).filter((d) => !dimensionOrder.includes(d)),
  ]

  return (
    <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 flex flex-col gap-5">
      {/* Header com status de save */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Tags</h3>
        <div className="flex items-center gap-3">
          {saveState === 'saving' && (
            <span className="text-xs text-muted-foreground animate-pulse">Salvando…</span>
          )}
          {saveState === 'saved' && (
            <span className="text-xs text-green-400">Salvo ✓</span>
          )}
          {saveState === 'error' && (
            <span className="text-xs text-red-400">Erro ao salvar</span>
          )}
          {canUndo && saveState === 'idle' && (
            <button
              onClick={handleUndo}
              disabled={isPending}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              ↩ Desfazer
            </button>
          )}
        </div>
      </div>

      {/* Tags por dimensão */}
      {orderedDimensions.map((dimension) => (
        <div key={dimension} className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {DIMENSION_LABELS[dimension] ?? dimension}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tagsByDimension[dimension].map((tag) => {
              const isActive = activeTags.has(tag.id)
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  disabled={isPending && saveState === 'saving'}
                  title={isActive ? 'Clique para remover' : 'Clique para adicionar'}
                  aria-pressed={isActive}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[var(--mm-gold)]/15 border-[var(--mm-gold)]/40 text-[var(--mm-gold)]'
                      : 'border-white/8 text-muted-foreground hover:border-white/20 hover:text-foreground'
                  }`}
                >
                  {isActive && <span className="mr-1">✓</span>}
                  {tag.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {allTags.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhuma tag configurada.</p>
      )}
    </div>
  )
}
