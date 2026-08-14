'use client'

import { useState, useTransition } from 'react'
import { flashcardRegistrarAction } from './actions'
import type { FlashcardFilaItem } from '@/lib/aluno/flashcards'

type Resultado = { pontosGanhos: number; proximaRevisao: string }

const fmtData = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')

export function FlashcardsClient({ cards: initialCards }: { cards: FlashcardFilaItem[] }) {
  // Congela a fila recebida no mount — ver comentário equivalente em
  // RevisarClient: Server Actions re-buscam os dados da rota após resolver,
  // o que trocaria o card sob o usuário se lêssemos a prop direto no render.
  const [cards] = useState(initialCards)
  const [idx, setIdx] = useState(0)
  const [virado, setVirado] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const card = cards[idx]

  if (!card) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-foreground">Flashcards</h1>
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="text-3xl">✓</div>
          <h2 className="mt-2 text-base font-bold text-foreground">Fila zerada</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nenhum flashcard pendente agora. Volte mais tarde.</p>
        </div>
      </div>
    )
  }

  function proxima() {
    setVirado(false)
    setResultado(null)
    setErro(null)
    setIdx((i) => i + 1)
  }

  function registrar(acertou: boolean) {
    setErro(null)
    startTransition(async () => {
      const res = await flashcardRegistrarAction(card.flashcardId, acertou)
      if (!res.ok) {
        setErro(res.error)
        return
      }
      setResultado(res.data)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Flashcards</h1>
        <span className="text-sm text-muted-foreground">
          {idx + 1} de {cards.length}
          {card.novo ? ' · novo' : ''}
        </span>
      </div>
      <div className="h-1.5 w-full rounded bg-muted">
        <div className="h-1.5 rounded bg-primary transition-all" style={{ width: `${(idx / cards.length) * 100}%` }} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        {card.cardType && (
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {card.cardType}
          </div>
        )}
        <div className="whitespace-pre-wrap text-lg font-semibold text-foreground">{card.front}</div>

        {!virado ? (
          <button
            onClick={() => setVirado(true)}
            className="mt-6 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Virar
          </button>
        ) : (
          <>
            <div className="mt-6 whitespace-pre-wrap border-t border-border pt-6 text-left text-sm leading-relaxed text-foreground">
              {card.back}
            </div>
            {!resultado && (
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={() => registrar(false)}
                  disabled={pending}
                  className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold hover:border-primary disabled:opacity-60"
                >
                  ❌ Errei
                </button>
                <button
                  onClick={() => registrar(true)}
                  disabled={pending}
                  className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  ✅ Acertei
                </button>
              </div>
            )}
          </>
        )}

        {resultado && (
          <div className="mt-6 rounded-xl bg-muted/40 p-4 text-sm text-foreground">
            Próxima revisão: <b>{fmtData(resultado.proximaRevisao)}</b> · <b>+{resultado.pontosGanhos} pontos</b>
            <div>
              <button
                onClick={proxima}
                className="mt-3 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
              >
                Próxima →
              </button>
            </div>
          </div>
        )}
        {erro && <p className="mt-3 text-sm text-[#D3402A]">{erro}</p>}
      </div>
    </div>
  )
}
