'use client'

import { useState } from 'react'
import { getQuestionPreviewAction, type QuestionPreview } from '../actions'
import { QuestionPreviewView } from '../question-preview-view'

export type QuestaoItem = {
  id: string
  position: number
  number: number | null
  stem: string
  examLabel: string
}

export function QuestoesList({ questoes }: { questoes: QuestaoItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [cache, setCache] = useState<Record<string, QuestionPreview | 'loading'>>({})

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null)
      return
    }
    setOpenId(id)
    if (!cache[id]) {
      setCache((c) => ({ ...c, [id]: 'loading' }))
      const d = await getQuestionPreviewAction(id)
      setCache((c) => ({
        ...c,
        [id]: d ?? { stem: '', alternatives: {}, correctAnswer: null, comments: [] },
      }))
    }
  }

  if (questoes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma questão vinculada.</p>
  }

  return (
    <div className="divide-y divide-border/50 rounded-lg border border-border text-sm">
      {questoes.map((q) => {
        const open = openId === q.id
        const pv = cache[q.id]
        return (
          <div key={q.id}>
            <div className="flex items-start gap-2 p-2">
              <span className="shrink-0 text-muted-foreground">{q.position}.</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">
                  {q.number ? `Q${q.number} · ` : ''}
                  {q.stem || '(sem enunciado)'}
                </span>
                <span className="block text-xs text-muted-foreground">{q.examLabel}</span>
              </span>
              <button
                type="button"
                onClick={() => toggle(q.id)}
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-card"
              >
                {open ? 'Fechar' : 'Ver'}
              </button>
            </div>
            {open && (
              <div className="border-t border-border/50 bg-card/40 px-3 py-3">
                {!pv || pv === 'loading' ? (
                  <p className="text-xs text-muted-foreground">Carregando…</p>
                ) : (
                  <QuestionPreviewView pv={pv} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
