'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { QuestionNote } from './question-note'
import {
  reorderSimuladoQuestions,
  removeQuestionFromSimulado,
} from '@/app/(dashboard)/simulados/actions'

type Question = {
  sqId: string
  position: number
  note: string | null
  questionId: string
  questionNumber: number
  stem: string
  examLabel: string
}

export function SimuladoQuestionList({
  simuladoId,
  initialQuestions,
}: {
  simuladoId: string
  initialQuestions: Question[]
}) {
  const [items, setItems] = useState(initialQuestions)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const dragIdx = useRef<number | null>(null)

  function onDragStart(i: number) {
    dragIdx.current = i
  }

  function onDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    setDragOver(i)
    if (dragIdx.current === null || dragIdx.current === i) return
    const reordered = [...items]
    const [dragged] = reordered.splice(dragIdx.current, 1)
    reordered.splice(i, 0, dragged)
    dragIdx.current = i
    setItems(reordered)
  }

  function onDrop() {
    setDragOver(null)
    dragIdx.current = null
    startTransition(async () => {
      await reorderSimuladoQuestions(simuladoId, items.map((q) => q.sqId))
    })
  }

  function onDragEnd() {
    setDragOver(null)
    dragIdx.current = null
  }

  async function handleRemove(questionId: string) {
    setRemoving(questionId)
    setItems((prev) => prev.filter((q) => q.questionId !== questionId))
    await removeQuestionFromSimulado(simuladoId, questionId)
    setRemoving(null)
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-8 text-center text-sm text-muted-foreground">
        Nenhuma questão adicionada. Use o painel ao lado para buscar questões.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((q, i) => (
        <div
          key={q.sqId}
          draggable
          onDragStart={() => onDragStart(i)}
          onDragOver={(e) => onDragOver(e, i)}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          className="rounded-xl border border-white/5 bg-[var(--mm-surface)]/40 px-4 py-3 flex flex-col gap-2 transition-colors"
          style={{
            cursor: 'grab',
            opacity: removing === q.questionId ? 0.4 : 1,
            borderColor: dragOver === i && dragIdx.current !== i
              ? 'rgba(212,168,67,0.4)'
              : undefined,
            background: dragOver === i && dragIdx.current !== i
              ? 'rgba(212,168,67,0.05)'
              : undefined,
          }}
        >
          <div className="flex items-start gap-3">
            {/* Drag handle */}
            <span
              className="shrink-0 mt-0.5 select-none"
              style={{ fontSize: 12, color: 'var(--mm-muted)', opacity: 0.4, cursor: 'grab', lineHeight: 1.4 }}
            >
              ⠿
            </span>
            <span className="text-xs tabular-nums text-muted-foreground/50 shrink-0 w-5 pt-0.5">
              {i + 1}.
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">
                Q{q.questionNumber}
                {q.examLabel ? ` · ${q.examLabel}` : ''}
              </p>
              <p className="text-sm text-foreground mt-0.5 line-clamp-2">{q.stem}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/questoes/${q.questionId}`}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                Ver
              </Link>
              <button
                onClick={() => handleRemove(q.questionId)}
                disabled={removing === q.questionId}
                className="text-xs text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-40"
              >
                Remover
              </button>
            </div>
          </div>
          <div className="pl-8">
            <QuestionNote simuladoId={simuladoId} sqId={q.sqId} initialNote={q.note} />
          </div>
        </div>
      ))}
    </div>
  )
}
