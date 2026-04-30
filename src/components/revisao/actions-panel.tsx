'use client'

import { useTransition, useState } from 'react'
import { submitReviewAction, saveAsDraft } from '@/app/(dashboard)/revisao/[id]/actions'

type Action = 'approve' | 'reject' | 'flag'

interface ActionsPanelProps {
  questionId: string
  currentStatus: string
  userId: string
}

const ACTIONS: { id: Action; label: string; description: string; color: string }[] = [
  {
    id: 'approve',
    label: 'Aprovar',
    description: 'Questão está correta e pronta para publicação.',
    color: 'bg-green-500/15 border-green-500/30 text-green-400 hover:bg-green-500/25',
  },
  {
    id: 'flag',
    label: 'Sinalizar',
    description: 'Questão precisa de atenção adicional (devolve à fila).',
    color: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/25',
  },
  {
    id: 'reject',
    label: 'Rejeitar',
    description: 'Questão inadequada para o banco.',
    color: 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25',
  },
]

export function ActionsPanel({ questionId, currentStatus }: ActionsPanelProps) {
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Action | null>(null)
  const [note, setNote] = useState('')
  const [confirmAction, setConfirmAction] = useState<Action | null>(null)

  const isDone = ['approved', 'rejected', 'published'].includes(currentStatus)

  function handleSelect(action: Action) {
    setSelected(action)
    setNote('')
    setConfirmAction(null)
  }

  function handleConfirmRequest(action: Action) {
    setConfirmAction(action)
  }

  function handleSubmit(action: Action) {
    startTransition(async () => {
      await submitReviewAction(questionId, action, note || undefined)
    })
  }

  function handleSaveDraft() {
    startTransition(async () => {
      await saveAsDraft(questionId)
    })
  }

  if (isDone) {
    return (
      <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-foreground">Status</h3>
        <p className="text-xs text-muted-foreground">
          Esta questão já foi revisada ({currentStatus}).
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-foreground">Ações de revisão</h3>

      <div className="flex flex-col gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            onClick={() => handleSelect(a.id)}
            disabled={pending}
            className={`w-full rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors ${a.color} ${selected === a.id ? 'ring-1 ring-current' : ''}`}
          >
            {a.label}
          </button>
        ))}
        <button
          onClick={handleSaveDraft}
          disabled={pending}
          title="Salva o estado atual e libera a questão para retomar depois."
          className="w-full rounded-lg border border-white/8 bg-white/4 px-3 py-2.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/8 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? 'Salvando…' : 'Salvar como rascunho'}
        </button>
      </div>

      {selected && (
        <div className="flex flex-col gap-3 border-t border-white/7 pt-4">
          <p className="text-xs text-muted-foreground">
            {ACTIONS.find((a) => a.id === selected)?.description}
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">
              Observação {selected !== 'approve' ? '(obrigatória)' : '(opcional)'}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={selected === 'approve' ? 'Ex: OK, questão bem formulada.' : 'Descreva o motivo...'}
              className="w-full rounded-lg border border-white/8 bg-white/4 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors focus:border-[var(--mm-gold)]/40 resize-none"
            />
          </div>

          {confirmAction === selected ? (
            <div className="flex gap-2">
              <button
                onClick={() => handleSubmit(selected)}
                disabled={pending || (selected !== 'approve' && !note.trim())}
                className="flex-1 rounded-lg bg-[var(--mm-gold)] px-3 py-2 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {pending ? 'Salvando…' : 'Confirmar'}
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                disabled={pending}
                className="rounded-lg border border-white/8 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleConfirmRequest(selected)}
              disabled={pending || (selected !== 'approve' && !note.trim())}
              className="w-full rounded-lg border border-white/8 px-3 py-2 text-xs font-medium text-foreground hover:bg-white/4 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {ACTIONS.find((a) => a.id === selected)?.label} →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
