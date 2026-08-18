'use client'

import { useState, useTransition } from 'react'
import { dismissCardAction } from '../actions'
import { recordPracticeAction } from '../praticar/actions'
import type { ErrorCard } from '@/lib/aluno/estudo'

const ALTS = ['A', 'B', 'C', 'D', 'E'] as const

const COMMENT_TYPE_LABEL: Record<string, string> = {
  explicacao: 'Explicação',
  pegadinha: 'Pegadinha',
  referencia: 'Referência',
  mnemonico: 'Mnemônico',
  atualizacao_conduta: 'Atualização de conduta',
  dica_professor: 'Dica do professor',
}

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
    <div className="max-w-3xl space-y-4">
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

type AnswerResult = { isCorrect: boolean; correctAnswer: string | null }

function Card({ card, onDominado }: { card: ErrorCard; onDominado: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // Modo passivo (questão sem alternativas ou sem gabarito): só revelar.
  const [revelado, setRevelado] = useState(false)
  const [isPending, startTransition] = useTransition()

  const statementImages = card.images.filter((i) => i.scope === 'statement')
  const altImages = (alt: string) =>
    card.images.filter((i) => i.scope === `alternative_${alt.toLowerCase()}`)
  const hasAlternatives = ALTS.some((a) => (card.alternatives[a] ?? '').trim() !== '')
  const activeMode = hasAlternatives && card.correctAnswer !== null
  const finished = result !== null || revelado
  const errouAntes = card.selectedAlt !== null && card.selectedAlt !== card.correctAnswer
  // "Já dominei" só depois de reprovar o erro: acertando de novo (ativo) ou
  // revisando a resposta (passivo, sem como responder).
  const podeDominar = activeMode ? result?.isCorrect === true : revelado

  function responder() {
    if (!selected) return
    startTransition(async () => {
      const r = await recordPracticeAction(card.questionId, selected)
      if (!r.ok) {
        setErro(r.error ?? 'Falha ao registrar a resposta.')
        return
      }
      setErro(null)
      setResult({ isCorrect: r.isCorrect ?? false, correctAnswer: r.correctAnswer ?? null })
    })
  }

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5">
      <p className="whitespace-pre-line text-sm text-foreground">{card.stem}</p>
      {statementImages.map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL efêmera do Supabase Storage
        <img
          key={i}
          src={img.url}
          alt="Figura da questão"
          className="mt-3 max-h-96 w-auto self-start rounded-lg border border-border"
        />
      ))}

      {hasAlternatives ? (
        <div className="mt-4 space-y-2">
          {ALTS.map((alt) => {
            const text = card.alternatives[alt]
            const imgs = altImages(alt)
            if (!text?.trim() && imgs.length === 0) return null
            const isSel = selected === alt
            const isCorrect = finished && card.correctAnswer === alt
            const isWrongPick = result !== null && !result.isCorrect && isSel
            const isErroAnterior =
              finished && errouAntes && card.selectedAlt === alt && !isWrongPick && !isCorrect
            return (
              <label
                key={alt}
                className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                  activeMode && !finished ? 'mm-chip cursor-pointer' : ''
                } ${
                  isCorrect
                    ? 'border-[#006048] bg-[rgba(0,96,72,0.1)]'
                    : isWrongPick
                      ? 'border-[#D3402A] bg-[rgba(211,64,42,0.1)]'
                      : finished
                        ? 'border-border opacity-60'
                        : isSel
                          ? 'border-primary bg-primary/5 shadow-[0_2px_12px_rgba(212,7,84,0.12)]'
                          : activeMode
                            ? 'border-border hover:border-primary/40 hover:bg-[rgba(14,40,65,0.02)]'
                            : 'border-border'
                }`}
              >
                {activeMode && (
                  <input
                    type="radio"
                    name={`alt-${card.questionId}`}
                    className="mt-1"
                    checked={isSel}
                    disabled={finished || isPending}
                    onChange={() => setSelected(alt)}
                  />
                )}
                <span className="flex-1 text-foreground">
                  <strong>{alt})</strong> {text}
                  {imgs.map((img, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL efêmera do Supabase Storage
                    <img
                      key={i}
                      src={img.url}
                      alt={`Figura da alternativa ${alt}`}
                      className="mt-2 max-h-72 w-auto rounded-lg border border-border"
                    />
                  ))}
                </span>
                {isCorrect && (
                  <span className="shrink-0 rounded-full bg-[#006048] px-2 py-0.5 text-xs font-medium text-white">
                    Gabarito
                  </span>
                )}
                {isWrongPick && (
                  <span className="shrink-0 rounded-full bg-[#D3402A] px-2 py-0.5 text-xs font-medium text-white">
                    Sua resposta
                  </span>
                )}
                {isErroAnterior && (
                  <span className="shrink-0 rounded-full bg-[#9E6606] px-2 py-0.5 text-xs font-medium text-white">
                    Erro anterior
                  </span>
                )}
              </label>
            )
          })}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Alternativas indisponíveis para esta questão.
        </p>
      )}

      {erro && <p className="mt-3 text-sm text-[#D3402A]">{erro}</p>}

      {!finished ? (
        activeMode ? (
          <button
            onClick={responder}
            disabled={!selected || isPending}
            className="mm-press mt-4 self-start rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-[0_4px_16px_rgba(212,7,84,0.25)] disabled:bg-[#E8E8E8] disabled:text-[#A4A3A4] disabled:shadow-none"
          >
            {isPending ? 'Corrigindo…' : 'Responder de novo'}
          </button>
        ) : (
          <button
            onClick={() => setRevelado(true)}
            className="mt-4 self-start rounded-lg border border-border px-3 py-1.5 text-sm text-foreground"
          >
            Mostrar resposta
          </button>
        )
      ) : (
        <div className="mm-animate-in mt-4 rounded-lg bg-muted/50 p-3 text-sm">
          {result !== null ? (
            <p className={`font-medium ${result.isCorrect ? 'text-[#006048]' : 'text-[#D3402A]'}`}>
              {result.isCorrect
                ? 'Você acertou! Agora pode marcar como dominada.'
                : `Errou de novo — gabarito: ${result.correctAnswer ?? '—'}. Revise o comentário; o card continua na sua lista.`}
            </p>
          ) : (
            <p className="font-medium text-[#006048]">Gabarito: {card.correctAnswer ?? '—'}</p>
          )}
          {errouAntes && (
            <p className="mt-1 text-xs text-muted-foreground">
              No erro original você marcou: {card.selectedAlt}
            </p>
          )}
          {card.comments.length > 0 ? (
            card.comments.map((c, i) => (
              <div key={i} className="mt-2">
                {c.type && c.type !== 'explicacao' && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {COMMENT_TYPE_LABEL[c.type] ?? c.type}
                  </p>
                )}
                <p className="whitespace-pre-line text-foreground">{c.content}</p>
              </div>
            ))
          ) : (
            <p className="mt-2 text-muted-foreground">
              Comentário em produção — em breve nesta questão.
            </p>
          )}
        </div>
      )}

      {podeDominar && (
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
      )}
    </div>
  )
}
