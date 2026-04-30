'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  reassignQuestionExam,
  type ExamOption,
} from '@/app/(dashboard)/revisao/[id]/exam-actions'

interface ExamPanelProps {
  questionId: string
  currentExamId: string
  exams: ExamOption[]
}

function formatExamLabel(exam: ExamOption): string {
  const parts = [
    exam.board?.short_name ?? exam.board?.name,
    exam.specialty?.name,
    exam.year,
    exam.booklet_color
      ? exam.booklet_color.charAt(0).toUpperCase() + exam.booklet_color.slice(1)
      : null,
  ].filter(Boolean)
  return parts.join(' · ')
}

export function ExamPanel({ questionId, currentExamId, exams }: ExamPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [selectedId, setSelectedId] = useState(currentExamId)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const currentExam = exams.find((e) => e.id === currentExamId) ?? null
  const selectedExam = exams.find((e) => e.id === selectedId) ?? null

  const filteredExams = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return exams
    return exams.filter((e) => formatExamLabel(e).toLowerCase().includes(q))
  }, [exams, search])

  function openEditor() {
    setSelectedId(currentExamId)
    setSearch('')
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setConfirming(false)
    setError(null)
  }

  function requestConfirm() {
    if (!selectedId || selectedId === currentExamId) {
      setEditing(false)
      return
    }
    setConfirming(true)
  }

  function commit() {
    setError(null)
    startTransition(async () => {
      const result = await reassignQuestionExam(questionId, selectedId)
      if (result.ok) {
        setConfirming(false)
        setEditing(false)
        router.refresh()
      } else {
        setError(result.error ?? 'Erro desconhecido')
        setConfirming(false)
      }
    })
  }

  return (
    <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Hierarquia
        </h3>
        {!editing && (
          <button
            onClick={openEditor}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Editar
          </button>
        )}
      </div>

      {currentExam ? (
        <dl className="flex flex-col gap-1.5 text-xs">
          {currentExam.board && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Banca</dt>
              <dd className="text-foreground text-right">
                {currentExam.board.short_name ?? currentExam.board.name}
              </dd>
            </div>
          )}
          {currentExam.specialty && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Especialidade</dt>
              <dd className="text-foreground text-right">{currentExam.specialty.name}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Ano</dt>
            <dd className="text-foreground">{currentExam.year}</dd>
          </div>
          {currentExam.booklet_color && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Cor</dt>
              <dd className="text-foreground capitalize">{currentExam.booklet_color}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">Sem exame vinculado.</p>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400">
          {error}
        </div>
      )}

      {editing && !confirming && (
        <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
          <input
            type="text"
            placeholder="Filtrar exames…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/8 bg-white/2 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[var(--mm-gold)]/40"
          />
          <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
            {filteredExams.map((exam) => {
              const isSelected = exam.id === selectedId
              const isCurrent = exam.id === currentExamId
              return (
                <button
                  key={exam.id}
                  onClick={() => setSelectedId(exam.id)}
                  className={`text-left rounded-md border px-2 py-1.5 text-xs transition-colors ${
                    isSelected
                      ? 'border-[var(--mm-gold)]/40 bg-[var(--mm-gold)]/10 text-[var(--mm-gold)]'
                      : 'border-white/5 text-muted-foreground hover:text-foreground hover:border-white/15'
                  }`}
                >
                  {formatExamLabel(exam)}
                  {isCurrent && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground/60">(atual)</span>
                  )}
                </button>
              )
            })}
            {filteredExams.length === 0 && (
              <p className="text-xs text-muted-foreground py-2 text-center">
                Nenhum exame encontrado.
              </p>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={cancel}
              className="flex-1 rounded-lg border border-white/8 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={requestConfirm}
              disabled={!selectedId || selectedId === currentExamId}
              className="flex-1 rounded-lg bg-[var(--mm-gold)]/15 border border-[var(--mm-gold)]/40 px-2.5 py-1.5 text-xs font-medium text-[var(--mm-gold)] hover:bg-[var(--mm-gold)]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      {confirming && selectedExam && (
        <div className="flex flex-col gap-3 pt-2 border-t border-white/5">
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300/90 leading-relaxed">
            <p className="font-semibold mb-1">Confirmar reatribuição?</p>
            <p>
              De: <span className="text-foreground">{currentExam ? formatExamLabel(currentExam) : '—'}</span>
            </p>
            <p>
              Para: <span className="text-foreground">{formatExamLabel(selectedExam)}</span>
            </p>
            <p className="mt-1.5 text-[11px] text-yellow-300/70">
              A alteração será registrada no log de revisões.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="flex-1 rounded-lg border border-white/8 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors disabled:opacity-40"
            >
              Voltar
            </button>
            <button
              onClick={commit}
              disabled={isPending}
              className="flex-1 rounded-lg bg-yellow-500/20 border border-yellow-500/40 px-2.5 py-1.5 text-xs font-medium text-yellow-300 hover:bg-yellow-500/30 transition-colors disabled:opacity-40"
            >
              {isPending ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
