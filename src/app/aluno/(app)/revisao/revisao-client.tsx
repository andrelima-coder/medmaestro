'use client'

import { useState, useTransition } from 'react'
import { dismissCardAction } from '../actions'
import type { ErrorCard } from '@/lib/aluno/estudo'

export function RevisaoClient({ cards }: { cards: ErrorCard[] }) {
  const [items, setItems] = useState(cards)

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum card de erro no momento. Continue praticando! 💪
      </p>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((c) => (
        <Card
          key={c.questionId}
          card={c}
          onDominado={() => setItems((prev) => prev.filter((x) => x.questionId !== c.questionId))}
        />
      ))}
    </div>
  )
}

function Card({ card, onDominado }: { card: ErrorCard; onDominado: () => void }) {
  const [revelado, setRevelado] = useState(false)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5">
      <p className="whitespace-pre-line text-sm text-foreground">{card.stem}</p>

      {!revelado ? (
        <button
          onClick={() => setRevelado(true)}
          className="mt-4 self-start rounded-lg border border-border px-3 py-1.5 text-sm text-foreground"
        >
          Mostrar resposta
        </button>
      ) : (
        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">
          <p className="text-emerald-600">Gabarito: {card.correctAnswer ?? '—'}</p>
          {card.comment && (
            <p className="mt-2 whitespace-pre-line text-foreground">{card.comment}</p>
          )}
        </div>
      )}

      <button
        onClick={() =>
          startTransition(async () => {
            const r = await dismissCardAction(card.questionId)
            if (r.ok) onDominado()
          })
        }
        disabled={isPending}
        className="mt-3 self-start text-xs font-medium text-primary hover:underline disabled:text-muted-foreground"
      >
        Já dominei esta
      </button>
    </div>
  )
}
