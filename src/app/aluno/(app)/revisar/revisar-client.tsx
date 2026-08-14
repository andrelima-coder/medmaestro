'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { revisarRevelarAction, revisarRegistrarAction } from './actions'

export type RevisarCard = {
  conceitoId: string
  proposicao: string
  modulo: string
  questionId: string
  stem: string
  alternatives: Record<string, string>
}

type Revelado = { acerto: boolean; correctAnswer: string; comentarios: { tipo: string; content: string }[] }
type Resultado = { pontosGanhos: number; proximaRevisao: string; pontoCego: boolean; skillProva: boolean }

const CAUSAS = [
  { key: 'nao_sabia', label: 'Não sabia' },
  { key: 'me_confundi', label: 'Me confundi' },
  { key: 'li_mal', label: 'Li mal o enunciado' },
  { key: 'faltou_tempo', label: 'Faltou tempo' },
]

const fmtData = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')

export function RevisarClient({ cards: initialCards }: { cards: RevisarCard[] }) {
  // Congela a fila recebida no mount: Server Actions no Next.js atualizam os
  // dados do servidor da rota automaticamente após resolver (mesmo sem
  // revalidatePath explícito), o que re-buscaria srs_fila() no meio do fluxo
  // e trocaria o card sob o usuário. Mesmo padrão já usado em AgendaClient.
  const [cards] = useState(initialCards)
  const [idx, setIdx] = useState(0)
  const [escolha, setEscolha] = useState<string | null>(null)
  const [confianca, setConfianca] = useState<number | null>(null)
  const [revelado, setRevelado] = useState<Revelado | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const tInicioRef = useRef(0)

  const card = cards[idx]

  useEffect(() => {
    setEscolha(null)
    setConfianca(null)
    setRevelado(null)
    setResultado(null)
    setErro(null)
    tInicioRef.current = Date.now()
  }, [idx])

  if (!card) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-foreground">Revisar</h1>
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="text-3xl">✓</div>
          <h2 className="mt-2 text-base font-bold text-foreground">Fila zerada</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nada pendente agora. Volte mais tarde.</p>
        </div>
      </div>
    )
  }

  function escolherConfianca(c: number) {
    setConfianca(c)
    startTransition(async () => {
      const tempoSeg = Math.round((Date.now() - tInicioRef.current) / 1000)
      const res = await revisarRevelarAction(card.questionId, escolha as string)
      if (!res.ok) {
        setErro(res.error)
        return
      }
      setRevelado(res.data)
      if (res.data.acerto) {
        const reg = await revisarRegistrarAction(card.conceitoId, card.questionId, true, c, tempoSeg, null)
        if (reg.ok) setResultado(reg.data)
        else setErro(reg.error)
      }
    })
  }

  function escolherCausa(motivo: string) {
    startTransition(async () => {
      const tempoSeg = Math.round((Date.now() - tInicioRef.current) / 1000)
      const reg = await revisarRegistrarAction(card.conceitoId, card.questionId, false, confianca as number, tempoSeg, motivo)
      if (reg.ok) setResultado(reg.data)
      else setErro(reg.error)
    })
  }

  const letras = (['A', 'B', 'C', 'D', 'E'] as const).filter((k) => card.alternatives[k])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Revisar</h1>
        <span className="text-sm text-muted-foreground">
          {idx + 1} de {cards.length}
        </span>
      </div>
      <div className="h-1.5 w-full rounded bg-muted">
        <div className="h-1.5 rounded bg-primary transition-all" style={{ width: `${(idx / cards.length) * 100}%` }} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="text-lg font-bold text-foreground">{card.proposicao}</div>
        <div className="mt-4 rounded-xl bg-muted/40 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{card.modulo}</div>
          <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">{card.stem}</div>
        </div>

        {!escolha && (
          <div className="mt-4 flex flex-col gap-2">
            {letras.map((k) => (
              <button
                key={k}
                onClick={() => setEscolha(k)}
                className="flex items-start gap-3 rounded-lg border border-border p-3 text-left text-sm transition hover:border-primary"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                  {k}
                </span>
                <span>{card.alternatives[k]}</span>
              </button>
            ))}
          </div>
        )}

        {escolha && !confianca && (
          <div className="mt-4">
            <h3 className="text-sm font-bold text-foreground">Quanto você confia nessa resposta?</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Isto é o dado mais importante da revisão — responda com sinceridade.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => escolherConfianca(1)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:border-primary"
              >
                😬 Chutei
              </button>
              <button
                onClick={() => escolherConfianca(2)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:border-primary"
              >
                🤔 Tenho dúvida
              </button>
              <button
                onClick={() => escolherConfianca(3)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:border-primary"
              >
                ✅ Tenho certeza
              </button>
            </div>
          </div>
        )}

        {pending && confianca && !revelado && <div className="mt-4 text-sm text-muted-foreground">Revelando…</div>}

        {revelado && (
          <div className="mt-4 flex flex-col gap-3">
            {letras.map((k) => (
              <div
                key={k}
                className={
                  'flex items-start gap-3 rounded-lg border p-3 text-left text-sm ' +
                  (k === revelado.correctAnswer
                    ? 'border-[#1E8E5A] bg-[rgba(30,142,90,0.06)]'
                    : k === escolha
                      ? 'border-[#D3402A] bg-[rgba(211,64,42,0.06)]'
                      : 'border-border opacity-60')
                }
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                  {k}
                </span>
                <span>{card.alternatives[k]}</span>
              </div>
            ))}

            <div
              className={
                'rounded-lg px-3 py-2 text-sm font-semibold ' +
                (revelado.acerto ? 'bg-[rgba(30,142,90,0.1)] text-[#1E8E5A]' : 'bg-[rgba(211,64,42,0.1)] text-[#D3402A]')
              }
            >
              {revelado.acerto ? 'Você acertou' : `Você errou · gabarito: ${revelado.correctAnswer}`}
            </div>

            {revelado.comentarios.length > 0 ? (
              revelado.comentarios.map((c, i) => (
                <div key={i} className="rounded-lg bg-muted/40 p-3 text-sm">
                  <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{c.tipo}</div>
                  <p className="mt-1 whitespace-pre-wrap text-foreground">{c.content}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sem comentário cadastrado para esta questão.</p>
            )}

            {!revelado.acerto && !resultado && (
              <div>
                <h3 className="text-sm font-bold text-foreground">Por que você errou?</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Erro de leitura ou de tempo não encurta o intervalo — não é lacuna de conteúdo.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CAUSAS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => escolherCausa(c.key)}
                      disabled={pending}
                      className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:border-primary disabled:opacity-60"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {resultado && (
              <div className="rounded-xl bg-muted/40 p-4 text-sm">
                {resultado.pontoCego && (
                  <p className="text-[#9E6606]">🎯 Ponto cego identificado — essa é a revisão que mais vale.</p>
                )}
                {resultado.skillProva && (
                  <p className="text-muted-foreground">
                    Isso é skill de prova, não conteúdo — seu intervalo não foi encurtado.
                  </p>
                )}
                <p className="text-foreground">
                  Próxima revisão: <b>{fmtData(resultado.proximaRevisao)}</b> · <b>+{resultado.pontosGanhos} pontos</b>
                </p>
                <button
                  onClick={() => setIdx((i) => i + 1)}
                  className="mt-3 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
                >
                  Próxima →
                </button>
              </div>
            )}
          </div>
        )}

        {erro && <p className="mt-3 text-sm text-[#D3402A]">{erro}</p>}
      </div>
    </div>
  )
}
