'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useParams } from 'next/navigation'
import { saveDoubt } from './actions'

export type ResultQuestion = {
  id: string
  number: number
  selected: string | null
  correct: boolean | null // null quando nota/gabarito não foi liberada
  correctAnswer: string | null
  stem: string | null // null quando revisão não foi liberada
  alternatives: Record<string, string> | null
  comment: string | null
  distribution: { counts: Record<string, number>; total: number } | null
}

const ALTS = ['A', 'B', 'C', 'D', 'E'] as const

export function ResultadoClient({
  campaignName,
  confetti,
  score,
  allowReview,
  liveUrl,
  questions,
}: {
  campaignName: string
  confetti: boolean
  score: { correct: number; total: number; pct: number } | null
  allowReview: boolean
  liveUrl: string | null
  questions: ResultQuestion[]
}) {
  return (
    <div className="space-y-6">
      {confetti && <Confetti />}

      <header className="mm-animate-in rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--mm-shadow-sm)]">
        <h1 className="text-xl font-bold text-foreground">{campaignName} — Resultado</h1>
        {confetti && (
          <p className="mt-1 text-sm text-[#006048]">
            🎉 Parabéns! Você concluiu de uma só vez e dentro do prazo.
          </p>
        )}
        {score ? (
          <p className="mt-3 text-3xl font-extrabold text-foreground">
            {score.correct}/{score.total}{' '}
            <span className="text-base font-medium text-muted-foreground">({score.pct}%)</span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            A nota e o gabarito serão liberados pela organização.
          </p>
        )}
        <ShareButton score={score} campaignName={campaignName} />
        {liveUrl && (
          <p className="mt-3 text-sm">
            Correção comentada na live:{' '}
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
              acompanhar
            </a>
          </p>
        )}
      </header>

      {/* Mapa de questões */}
      <section className="mm-animate-in rounded-2xl border border-border bg-card p-6 shadow-[var(--mm-shadow-sm)]" style={{ '--stagger': 1 } as CSSProperties}>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Mapa de questões</h2>
        <div className="grid grid-cols-8 gap-2 sm:grid-cols-10">
          {questions.map((q, i) => {
            const cls =
              q.correct === true
                ? 'bg-[#006048] text-white'
                : q.correct === false
                  ? 'bg-[#D3402A] text-white'
                  : q.selected
                    ? 'bg-muted text-foreground'
                    : 'border border-border text-muted-foreground'
            return (
              <a
                key={i}
                href={allowReview ? `#q-${q.number}` : undefined}
                className={`mm-pop-in mm-chip flex size-9 items-center justify-center rounded-md text-xs hover:scale-110 ${cls}`}
                style={{ '--stagger': Math.min(i, 30) } as CSSProperties}
                title={
                  q.correct === true
                    ? 'Acertou'
                    : q.correct === false
                      ? 'Errou'
                      : q.selected
                        ? 'Respondida'
                        : 'Em branco'
                }
              >
                {q.number}
              </a>
            )
          })}
        </div>
        {score === null && (
          <p className="mt-3 text-xs text-muted-foreground">
            Cinza = respondida. O acerto/erro aparece quando o gabarito for liberado.
          </p>
        )}
      </section>

      {/* Revisão por questão */}
      {allowReview && (
        <section className="space-y-4">
          {questions.map((q) => (
            <QuestionReview key={q.number} q={q} />
          ))}
        </section>
      )}
    </div>
  )
}

function QuestionReview({ q }: { q: ResultQuestion }) {
  const params = useParams<{ id: string }>()
  const [doubtSent, setDoubtSent] = useState(false)
  const distTotal = q.distribution?.total ?? 0

  async function onDoubt() {
    const text = window.prompt('Qual a sua dúvida sobre esta questão? (será respondida na live)')
    if (!text) return
    const res = await saveDoubt(params.id, q.id, text)
    if (res.ok) setDoubtSent(true)
  }

  return (
    <div id={`q-${q.number}`} className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Questão {q.number}</span>
        {q.correct === true && <span className="text-xs text-[#006048]">Acertou</span>}
        {q.correct === false && <span className="text-xs text-[#D3402A]">Errou</span>}
      </div>
      {q.stem && <p className="whitespace-pre-line text-sm text-foreground">{q.stem}</p>}

      {q.alternatives && (
        <ul className="mt-3 space-y-1.5">
          {ALTS.map((alt) => {
            const text = q.alternatives![alt]
            if (!text) return null
            const isSelected = q.selected === alt
            const isCorrect = q.correctAnswer === alt
            const dist = q.distribution?.counts[alt] ?? 0
            const pct = distTotal > 0 ? Math.round((dist / distTotal) * 100) : null
            return (
              <li
                key={alt}
                className={`mm-chip rounded-lg border p-2 text-sm ${
                  isCorrect
                    ? 'border-[#006048] bg-[rgba(0,96,72,0.1)]'
                    : isSelected
                      ? 'border-[#D3402A] bg-[rgba(211,64,42,0.1)]'
                      : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-foreground">
                    <strong>{alt})</strong> {text}
                    {isSelected && <em className="ml-1 text-xs text-muted-foreground">— sua resposta</em>}
                  </span>
                  {pct !== null && <span className="text-xs text-muted-foreground">{pct}%</span>}
                </div>
                {pct !== null && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
                    <div className="mm-grow-x h-1.5 rounded bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {q.comment && (
        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm text-foreground">
          <div className="mb-1 text-xs font-semibold text-muted-foreground">Comentário</div>
          <p className="whitespace-pre-line">{q.comment}</p>
        </div>
      )}

      <button
        onClick={onDoubt}
        disabled={doubtSent}
        className="mt-3 text-xs font-medium text-primary hover:underline disabled:text-muted-foreground"
      >
        {doubtSent ? 'Dúvida enviada para a live ✓' : 'Tenho uma dúvida (responder na live)'}
      </button>
    </div>
  )
}

function ShareButton({
  score,
  campaignName,
}: {
  score: { correct: number; total: number; pct: number } | null
  campaignName: string
}) {
  const [copied, setCopied] = useState(false)
  async function share() {
    const text = score
      ? `Fiz ${score.pct}% no simulado "${campaignName}" do MedMaestro!`
      : `Acabei de fazer o simulado "${campaignName}" do MedMaestro!`
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
      }
    } catch {
      /* usuário cancelou */
    }
  }
  return (
    <button
      onClick={share}
      className="mm-chip mm-press mt-3 rounded-lg border border-border px-4 py-1.5 text-sm text-foreground hover:border-[var(--mm-border-hover)] hover:bg-[rgba(14,40,65,0.03)]"
    >
      {copied ? 'Copiado!' : 'Compartilhar resultado'}
    </button>
  )
}

function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const colors = ['#9E6606', '#006048', '#206973', '#D3402A', '#7B3FA0']
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      r: 4 + Math.random() * 6,
      c: colors[Math.floor(Math.random() * colors.length)],
      vy: 2 + Math.random() * 3,
      vx: -1 + Math.random() * 2,
    }))
    let frame = 0
    let raf = 0
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      pieces.forEach((p) => {
        p.y += p.vy
        p.x += p.vx
        ctx.fillStyle = p.c
        ctx.fillRect(p.x, p.y, p.r, p.r)
      })
      frame++
      if (frame < 220) raf = requestAnimationFrame(draw)
      else ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <canvas
      ref={ref}
      className="pointer-events-none fixed inset-0 z-50"
      aria-hidden="true"
    />
  )
}
