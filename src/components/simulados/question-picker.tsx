'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  searchQuestionsForSimulado,
  addQuestionToSimulado,
  removeQuestionFromSimulado,
} from '@/app/(dashboard)/simulados/actions'

interface QuestionPickerProps {
  simuladoId: string
  initialAddedIds: string[]
}

type QResult = {
  id: string
  question_number: number
  stem: string
  exam_label: string
}

export function QuestionPicker({ simuladoId, initialAddedIds }: QuestionPickerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [results, setResults] = useState<QResult[]>([])
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set(initialAddedIds))
  const [searched, setSearched] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = inputRef.current?.value.trim() ?? ''
    startTransition(async () => {
      const { questions, addedIds: freshIds } = await searchQuestionsForSimulado(simuladoId, q)
      setResults(questions)
      setAddedIds(new Set(freshIds))
      setSearched(true)
    })
  }

  function handleToggle(questionId: string) {
    setLoadingId(questionId)
    const isAdded = addedIds.has(questionId)
    startTransition(async () => {
      if (isAdded) {
        await removeQuestionFromSimulado(simuladoId, questionId)
        setAddedIds((prev) => {
          const next = new Set(prev)
          next.delete(questionId)
          return next
        })
      } else {
        await addQuestionToSimulado(simuladoId, questionId)
        setAddedIds((prev) => new Set([...prev, questionId]))
      }
      setLoadingId(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          ref={inputRef}
          placeholder="Buscar questões aprovadas…"
          className="flex-1 h-9 rounded-lg border border-white/8 bg-white/4 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
        />
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-3 rounded-lg border border-white/8 text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors disabled:opacity-40"
        >
          {isPending ? '…' : 'Buscar'}
        </button>
      </form>

      {!searched && (
        <p className="text-xs text-muted-foreground">
          Busque questões aprovadas para adicionar ao simulado.
        </p>
      )}

      {searched && results.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhuma questão encontrada.</p>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-1 max-h-96 overflow-y-auto pr-1">
          {results.map((q) => {
            const isAdded = addedIds.has(q.id)
            const isLoading = loadingId === q.id
            return (
              <div
                key={q.id}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  isAdded
                    ? 'border-[var(--mm-gold)]/20 bg-[var(--mm-gold)]/5'
                    : 'border-white/5 bg-white/2 hover:bg-white/4'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Q{q.question_number}
                    {q.exam_label ? ` · ${q.exam_label}` : ''}
                  </p>
                  <p className="text-sm text-foreground truncate">{q.stem}</p>
                </div>
                <button
                  onClick={() => handleToggle(q.id)}
                  disabled={isLoading || (isPending && loadingId !== q.id)}
                  className={`shrink-0 text-xs rounded-md px-2.5 py-1 transition-colors disabled:opacity-40 ${
                    isAdded
                      ? 'text-red-400 hover:bg-red-500/10 border border-red-500/20'
                      : 'text-[var(--mm-gold)] hover:bg-[var(--mm-gold)]/10 border border-[var(--mm-gold)]/20'
                  }`}
                >
                  {isLoading ? '…' : isAdded ? '− Remover' : '+ Adicionar'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
