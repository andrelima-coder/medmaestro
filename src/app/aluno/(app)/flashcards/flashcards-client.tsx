'use client'

import type * as React from 'react'

import { useEffect, useRef, useState, useTransition } from 'react'
import { flashcardRegistrarAction, flashcardDesfazerAction, type Grau } from './actions'
import type { FlashcardFilaItem } from '@/lib/aluno/flashcards'

// Estudo estilo Anki: card com virada 3D, 4 graus de resposta com previsão de
// intervalo, atalhos de teclado (espaço · 1–4 · Z) e desfazer. Card errado
// volta ao fim da fila da própria sessão (learning step de 10 min no banco).

type HistItem = { card: FlashcardFilaItem; grau: Grau; pontos: number; snapshot: unknown }

const CORES_GRAU: Record<Grau, string> = {
  1: 'bg-[#D3402A]',
  2: 'bg-[#E08A00]',
  3: 'bg-[#1E9E6A]',
  4: 'bg-[#2E7CD6]',
}
const ROTULOS_GRAU: Record<Grau, string> = { 1: 'Errei', 2: 'Difícil', 3: 'Bom', 4: 'Fácil' }

function fmtIntervalo(dias: number): string {
  if (dias < 1) return '<10 min'
  if (dias < 30) return `${Math.round(dias)} d`
  if (dias < 365) return `${(dias / 30).toFixed(1).replace('.0', '')} mês`
  return `${(dias / 365).toFixed(1).replace('.0', '')} ano`
}

/** Previsão exibida nos botões — espelha as fórmulas de mt_flashcard_registrar_v2 (sem fuzz). */
function previsoes(card: FlashcardFilaItem): Record<Grau, string> {
  const { intervaloDias: i, ease } = card
  if (card.novo || i < 1) return { 1: '<10 min', 2: '1 d', 3: '1 d', 4: '4 d' }
  if (i <= 1) return { 1: '<10 min', 2: '1 d', 3: '3 d', 4: '5 d' }
  return {
    1: '<10 min',
    2: fmtIntervalo(Math.max(i + 1, Math.round(i * 1.2))),
    3: fmtIntervalo(Math.round(i * ease)),
    4: fmtIntervalo(Math.round(i * ease * 1.3)),
  }
}

const fmtData = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')

export function FlashcardsClient({ cards: initialCards }: { cards: FlashcardFilaItem[] }) {
  // Fila local mutável: Server Actions re-buscam a rota após resolver, então a
  // fila vive no estado do client (mesma razão do freeze antigo, ver RevisarClient).
  const [fila, setFila] = useState(initialCards)
  const [virado, setVirado] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const [respondidas, setRespondidas] = useState(0)
  const [acertos, setAcertos] = useState(0)
  const [pontos, setPontos] = useState(0)
  const [hist, setHist] = useState<HistItem[]>([])
  const [toast, setToast] = useState<{ texto: string; key: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const card = fila[0]
  const total = respondidas + fila.length

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function avisar(texto: string) {
    setToast({ texto, key: Date.now() })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  function responder(grau: Grau) {
    if (!card || !virado || pending || saindo) return
    setErro(null)
    startTransition(async () => {
      const res = await flashcardRegistrarAction(card.flashcardId, grau)
      if (!res.ok) {
        setErro(res.error)
        return
      }
      const d = res.data
      setHist((h) => [...h, { card, grau, pontos: d.pontosGanhos, snapshot: d.snapshot }])
      setRespondidas((n) => n + 1)
      if (grau > 1) {
        setAcertos((n) => n + 1)
        setPontos((p) => p + d.pontosGanhos)
        avisar(
          `+${d.pontosGanhos} ${d.pontosGanhos === 1 ? 'ponto' : 'pontos'} · próxima revisão ${
            d.proximaRevisao ? 'em ' + fmtData(d.proximaRevisao) : 'em breve'
          }`
        )
      } else if (d.leech) {
        avisar('Card errado 4+ vezes seguidas — considere estudá-lo por outro ângulo.')
      } else {
        avisar('Sem pontos — o card volta ainda nesta sessão.')
      }
      setSaindo(true)
      setTimeout(() => {
        setFila((f) => {
          const [atual, ...resto] = f
          if (grau === 1 && atual) {
            return [...resto, { ...atual, novo: false, estado: 'aprendendo', intervaloDias: 0 }]
          }
          return resto
        })
        setVirado(false)
        setSaindo(false)
      }, 250)
    })
  }

  function desfazer() {
    const ultimo = hist[hist.length - 1]
    if (!ultimo || pending || saindo) return
    setErro(null)
    startTransition(async () => {
      const res = await flashcardDesfazerAction(ultimo.card.flashcardId, ultimo.snapshot)
      if (!res.ok) {
        setErro(res.error)
        return
      }
      setHist((h) => h.slice(0, -1))
      setRespondidas((n) => n - 1)
      if (ultimo.grau > 1) {
        setAcertos((n) => n - 1)
        setPontos((p) => p - ultimo.pontos)
        setFila((f) => [ultimo.card, ...f])
      } else {
        // errado havia voltado pro fim da fila — remove a cópia e devolve à frente
        setFila((f) => {
          const semCopia = [...f]
          for (let i = semCopia.length - 1; i >= 0; i--) {
            if (semCopia[i].flashcardId === ultimo.card.flashcardId) {
              semCopia.splice(i, 1)
              break
            }
          }
          return [ultimo.card, ...semCopia]
        })
      }
      setVirado(false)
      avisar('Resposta desfeita.')
    })
  }

  // Atalhos: espaço vira · 1–4 respondem · Z desfaz
  const handlers = useRef({ responder, desfazer, virar: () => setVirado(true) })
  handlers.current = { responder, desfazer, virar: () => setVirado(true) }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement
      if (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ') {
        e.preventDefault()
        handlers.current.virar()
      } else if (e.key >= '1' && e.key <= '4') {
        handlers.current.responder(Number(e.key) as Grau)
      } else if (e.key.toLowerCase() === 'z') {
        handlers.current.desfazer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const novos = fila.filter((c) => c.novo).length
  const aprendendo = fila.filter((c) => !c.novo && c.estado !== 'revisao').length
  const revisao = fila.filter((c) => !c.novo && c.estado === 'revisao').length

  // ===== Fim de sessão =====
  if (!card) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-2xl font-bold text-foreground">Flashcards</h1>
        <div className="mm-pop-in rounded-2xl border border-border bg-card p-10 text-center shadow-[var(--mm-shadow)]">
          <div className="text-4xl">{respondidas > 0 ? '🎉' : '✓'}</div>
          <h2 className="mt-3 text-lg font-bold text-foreground">
            {respondidas > 0 ? 'Sessão concluída' : 'Fila zerada'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {respondidas > 0
              ? 'Tudo revisado por hoje. Os intervalos foram atualizados.'
              : 'Nenhum flashcard pendente agora. Volte mais tarde.'}
          </p>
          {respondidas > 0 && (
            <div className="mx-auto mt-6 grid max-w-sm grid-cols-3 gap-3">
              <div className="mm-animate-in rounded-xl bg-muted p-3" style={{ '--stagger': 1 } as React.CSSProperties}>
                <div className="text-xl font-bold tabular-nums text-foreground">{respondidas}</div>
                <div className="text-xs text-muted-foreground">respostas</div>
              </div>
              <div className="mm-animate-in rounded-xl bg-muted p-3" style={{ '--stagger': 2 } as React.CSSProperties}>
                <div className="text-xl font-bold tabular-nums text-foreground">
                  {Math.round((acertos / respondidas) * 100)}%
                </div>
                <div className="text-xs text-muted-foreground">acerto</div>
              </div>
              <div className="mm-animate-in rounded-xl bg-muted p-3" style={{ '--stagger': 3 } as React.CSSProperties}>
                <div className="text-xl font-bold tabular-nums text-foreground">{pontos}</div>
                <div className="text-xs text-muted-foreground">pontos</div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const prev = previsoes(card)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Flashcards</h1>
        <div className="flex gap-4 text-sm tabular-nums text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-[#2E7CD6]" />
            <b className="text-foreground">{novos}</b> novos
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-[#D3402A]" />
            <b className="text-foreground">{aprendendo}</b> aprendendo
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-[#1E9E6A]" />
            <b className="text-foreground">{revisao}</b> revisão
          </span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
        <div
          className="mm-bar h-1.5 rounded bg-primary"
          style={{ width: `${total ? (respondidas / total) * 100 : 0}%` }}
        />
      </div>

      {/* Baralho: card ativo com virada 3D + duas “cartas” atrás */}
      <div className="relative mt-2 [perspective:1400px]">
        <div className="absolute inset-0 translate-y-5 scale-[.94] rounded-2xl border border-border bg-card opacity-30 shadow-md" />
        <div className="absolute inset-0 translate-y-2.5 scale-[.97] rounded-2xl border border-border bg-card opacity-60 shadow-md" />
        <div
          role="button"
          tabIndex={0}
          aria-label={virado ? 'Resposta do flashcard' : 'Virar flashcard'}
          onClick={() => setVirado(true)}
          onKeyDown={(e) => e.key === 'Enter' && setVirado(true)}
          className={`relative min-h-[400px] transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none ${
            virado ? '[transform:rotateY(180deg)]' : 'cursor-pointer'
          } ${saindo ? 'opacity-0 duration-200' : ''}`}
        >
          {/* Frente */}
          <div className="absolute inset-0 flex flex-col overflow-y-auto rounded-2xl border border-border bg-card p-8 shadow-lg [backface-visibility:hidden]">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <span>{card.cardType ?? 'QA'}</span>
              {card.novo ? (
                <span className="rounded-full bg-[#2E7CD6]/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-[#2E7CD6]">
                  NOVO
                </span>
              ) : card.estado !== 'revisao' ? (
                <span className="rounded-full bg-[#D3402A]/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-[#D3402A]">
                  APRENDENDO
                </span>
              ) : null}
            </div>
            <div className="flex flex-1 items-center justify-center py-4 text-center text-xl font-semibold leading-snug text-foreground [text-wrap:balance] whitespace-pre-wrap">
              {card.front}
            </div>
            <div className="text-center text-xs text-muted-foreground">
              toque no card ou pressione{' '}
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px]">espaço</kbd> para virar
            </div>
          </div>
          {/* Verso */}
          <div className="absolute inset-0 flex flex-col overflow-y-auto rounded-2xl border border-border bg-card p-8 shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {card.cardType ?? 'QA'}
            </div>
            <div className="mt-3 border-b border-border pb-3 text-center text-sm text-muted-foreground">
              {card.front}
            </div>
            <div className="flex-1 whitespace-pre-wrap py-5 text-left text-base leading-relaxed text-foreground">
              {card.back}
            </div>
          </div>
        </div>
      </div>

      {/* 4 graus de resposta com previsão de intervalo */}
      <div
        className={`grid grid-cols-4 gap-2.5 transition-all duration-300 motion-reduce:transition-none sm:gap-3 ${
          virado ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
        }`}
      >
        {([1, 2, 3, 4] as Grau[]).map((g) => (
          <button
            key={g}
            onClick={() => responder(g)}
            disabled={pending || saindo}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60 motion-reduce:transition-none ${CORES_GRAU[g]}`}
          >
            {ROTULOS_GRAU[g]}
            <span className="text-xs font-semibold tabular-nums opacity-90">{prev[g]}</span>
            <span className="text-[10px] font-medium opacity-70">tecla {g}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">
          {respondidas + 1} de {total}
        </span>
        <button
          onClick={desfazer}
          disabled={hist.length === 0 || pending || saindo}
          className="rounded-lg border border-border px-3.5 py-1.5 text-xs hover:border-primary hover:text-primary disabled:cursor-default disabled:opacity-40"
        >
          ↩ Desfazer (Z)
        </button>
      </div>

      {erro && <p className="text-sm text-[#D3402A]">{erro}</p>}

      {toast && (
        <div
          key={toast.key}
          className="fixed bottom-7 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-foreground px-5 py-2.5 text-sm text-background shadow-xl"
        >
          {toast.texto}
        </div>
      )}
    </div>
  )
}
