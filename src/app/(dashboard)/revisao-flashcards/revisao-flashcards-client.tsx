'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  approveFlashcardAction,
  editFlashcardAction,
  rejectFlashcardAction,
  type PendingCard,
} from '../flashcards/actions'
import { RichEditor } from '@/components/ui/rich-editor'
import { sanitizeHtml, isHtml } from '@/lib/sanitize-html'

export function RevisaoFlashcardsClient({ cards }: { cards: PendingCard[] }) {
  const router = useRouter()
  const [idx, setIdx] = useState(0)
  const [showBack, setShowBack] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [editDifficulty, setEditDifficulty] = useState(3)

  const card = cards[idx]
  const total = cards.length

  function next() {
    setShowBack(false)
    setEditing(false)
    if (idx + 1 >= total) router.refresh()
    else setIdx(idx + 1)
  }

  function approve() {
    if (!card || pending) return
    startTransition(async () => {
      await approveFlashcardAction(card.id)
      next()
    })
  }

  function reject() {
    if (!card || pending) return
    startTransition(async () => {
      await rejectFlashcardAction(card.id)
      next()
    })
  }

  function startEdit() {
    if (!card) return
    setEditFront(toEditableHtml(card.front))
    setEditBack(toEditableHtml(card.back))
    setEditDifficulty(card.difficulty)
    setEditing(true)
  }

  function saveEdit() {
    if (!card || pending) return
    startTransition(async () => {
      await editFlashcardAction(card.id, {
        front: sanitizeHtml(editFront),
        back: sanitizeHtml(editBack),
        difficulty: editDifficulty,
      })
      await approveFlashcardAction(card.id)
      next()
    })
  }

  function toEditableHtml(text: string): string {
    if (!text) return ''
    if (isHtml(text)) return text
    return text
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('')
  }

  // Atalhos
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing) return
      if (e.code === 'Space') {
        e.preventDefault()
        setShowBack((v) => !v)
      } else if (e.key === 'a' || e.key === 'A') approve()
      else if (e.key === 'd' || e.key === 'D') reject()
      else if (e.key === 'e' || e.key === 'E') startEdit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, editing, pending])

  if (!card) {
    return (
      <div
        style={{
          background: 'var(--mm-surface)',
          border: '1px solid var(--mm-line)',
          borderRadius: 12,
          padding: 40,
          textAlign: 'center',
          color: 'var(--mm-muted)',
          fontSize: 13,
        }}
      >
        Todos os cards revisados desta página. Recarregando…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Progresso */}
      <div
        style={{
          fontSize: 11,
          color: 'var(--mm-muted)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>
          Card {idx + 1} / {total} · {card.exam_label}
          {card.question_number != null && ` · Q${card.question_number}`}
        </span>
        <span>
          {card.card_type.toUpperCase()} · dificuldade {card.difficulty}/5
        </span>
      </div>

      {/* Card central */}
      <div
        style={{
          background: 'var(--mm-surface)',
          border: '1px solid var(--mm-line)',
          borderRadius: 12,
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          minHeight: 320,
        }}
      >
        {!editing ? (
          <>
            <div>
              <div style={labelStyle}>Front</div>
              <RenderRichText html={card.front} />
            </div>
            {showBack && (
              <div style={{ paddingTop: 16, borderTop: '1px solid var(--mm-line2)' }}>
                <div style={labelStyle}>Back</div>
                <RenderRichText html={card.back} />
              </div>
            )}
            {!showBack && (
              <button onClick={() => setShowBack(true)} style={btnGhost}>
                Mostrar resposta (Espaço)
              </button>
            )}
          </>
        ) : (
          <>
            <div>
              <div style={labelStyle}>Front</div>
              <RichEditor
                value={editFront}
                onChange={setEditFront}
                placeholder="Pergunta do card…"
                ariaLabel="Editar frente do card"
                minRows={3}
              />
            </div>
            <div>
              <div style={labelStyle}>Back</div>
              <RichEditor
                value={editBack}
                onChange={setEditBack}
                placeholder="Resposta do card…"
                ariaLabel="Editar verso do card"
                minRows={5}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--mm-text2)' }}>
                Dificuldade:&nbsp;
                <select
                  value={editDifficulty}
                  onChange={(e) => setEditDifficulty(Number(e.target.value))}
                  style={selectStyle}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        {editing ? (
          <>
            <button onClick={saveEdit} disabled={pending} style={btnSuccess(!pending)}>
              Salvar e aprovar
            </button>
            <button onClick={() => setEditing(false)} style={btnGhost}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button onClick={approve} disabled={pending} style={btnSuccess(!pending)}>
              Aprovar (A)
            </button>
            <button onClick={startEdit} disabled={pending} style={btnSecondary}>
              Editar (E)
            </button>
            <button onClick={reject} disabled={pending} style={btnDanger(!pending)}>
              Descartar (D)
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function RenderRichText({ html }: { html: string }) {
  const text = html ?? ''
  if (isHtml(text)) {
    return (
      <div
        className="mm-rich-output"
        style={contentStyle}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }}
      />
    )
  }
  return <div style={contentStyle}>{text}</div>
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--mm-muted)',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  marginBottom: 8,
}

const contentStyle: React.CSSProperties = {
  fontSize: 16,
  color: 'var(--mm-text)',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
}

const selectStyle: React.CSSProperties = {
  background: 'var(--mm-bg2)',
  border: '1px solid var(--mm-line2)',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12,
  color: 'var(--mm-text)',
}

const btnBase: React.CSSProperties = {
  fontFamily: 'var(--font-syne)',
  fontSize: 12,
  fontWeight: 700,
  padding: '10px 20px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
}

function btnSuccess(active: boolean): React.CSSProperties {
  return {
    ...btnBase,
    background: active ? '#66BB6A' : 'var(--mm-bg2)',
    color: active ? '#0a0a0a' : 'var(--mm-muted)',
    cursor: active ? 'pointer' : 'default',
  }
}

function btnDanger(active: boolean): React.CSSProperties {
  return {
    ...btnBase,
    background: active ? 'rgba(239,83,80,0.15)' : 'var(--mm-bg2)',
    color: active ? '#EF5350' : 'var(--mm-muted)',
    border: active ? '1px solid rgba(239,83,80,0.4)' : '1px solid var(--mm-line2)',
    cursor: active ? 'pointer' : 'default',
  }
}

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: 'var(--mm-bg2)',
  color: 'var(--mm-text2)',
  border: '1px solid var(--mm-line2)',
}

const btnGhost: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--mm-text2)',
  border: '1px solid var(--mm-line2)',
  fontSize: 12,
  fontWeight: 600,
  padding: '8px 16px',
  borderRadius: 8,
  cursor: 'pointer',
}
