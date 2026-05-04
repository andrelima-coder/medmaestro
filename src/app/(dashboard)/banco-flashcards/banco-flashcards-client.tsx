'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  deleteBancoFlashcardAction,
  updateBancoFlashcardAction,
  type BancoFlashcard,
  type BancoListResult,
} from './actions'
import { RichEditor } from '@/components/ui/rich-editor'
import { sanitizeHtml, isHtml, htmlToPlainText } from '@/lib/sanitize-html'

type Filter = {
  examId: string
  cardType: string
  status: 'all' | 'approved' | 'pending'
  query: string
  difficulty: number | null
  page: number
}

export function BancoFlashcardsClient({
  result,
  exams,
  initialFilter,
}: {
  result: BancoListResult
  exams: { id: string; label: string }[]
  initialFilter: Filter
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [editDifficulty, setEditDifficulty] = useState(3)
  const [searchInput, setSearchInput] = useState(initialFilter.query)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))

  const buildUrl = useMemo(
    () => (next: Partial<Filter>) => {
      const f: Filter = { ...initialFilter, ...next }
      const params = new URLSearchParams()
      if (f.examId) params.set('exam', f.examId)
      if (f.cardType && f.cardType !== 'all') params.set('type', f.cardType)
      if (f.status && f.status !== 'all') params.set('status', f.status)
      if (f.query) params.set('q', f.query)
      if (f.difficulty != null) params.set('diff', String(f.difficulty))
      if (f.page && f.page !== 1) params.set('page', String(f.page))
      return `/banco-flashcards${params.toString() ? `?${params.toString()}` : ''}`
    },
    [initialFilter]
  )

  function startEdit(c: BancoFlashcard) {
    setEditingId(c.id)
    setEditFront(toEditableHtml(c.front))
    setEditBack(toEditableHtml(c.back))
    setEditDifficulty(c.difficulty ?? 3)
    setFeedback(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setFeedback(null)
  }

  function save(card: BancoFlashcard) {
    startTransition(async () => {
      const res = await updateBancoFlashcardAction(card.id, {
        front: sanitizeHtml(editFront),
        back: sanitizeHtml(editBack),
        difficulty: editDifficulty,
      })
      if (res.ok) {
        setFeedback('Salvo.')
        setEditingId(null)
        router.refresh()
      } else {
        setFeedback(`Erro: ${res.error ?? 'falha ao salvar'}`)
      }
    })
  }

  function toggleApproval(card: BancoFlashcard) {
    startTransition(async () => {
      await updateBancoFlashcardAction(card.id, { approved: !card.approved })
      router.refresh()
    })
  }

  function remove(card: BancoFlashcard) {
    if (!confirm('Excluir este flashcard? Esta ação não pode ser desfeita.')) return
    startTransition(async () => {
      await deleteBancoFlashcardAction(card.id)
      router.refresh()
    })
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    router.push(buildUrl({ query: searchInput, page: 1 }))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div
        style={{
          background: 'var(--mm-surface)',
          border: '1px solid var(--mm-line)',
          borderRadius: 12,
          padding: 16,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <select
          value={initialFilter.examId}
          onChange={(e) => router.push(buildUrl({ examId: e.target.value, page: 1 }))}
          style={selectStyle}
        >
          <option value="">Todos os exames</option>
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        <select
          value={initialFilter.cardType}
          onChange={(e) => router.push(buildUrl({ cardType: e.target.value, page: 1 }))}
          style={selectStyle}
        >
          <option value="all">Todos os tipos</option>
          <option value="qa">Q&A</option>
          <option value="cloze">Cloze</option>
        </select>
        <select
          value={initialFilter.status}
          onChange={(e) =>
            router.push(
              buildUrl({ status: e.target.value as Filter['status'], page: 1 })
            )
          }
          style={selectStyle}
        >
          <option value="all">Todos</option>
          <option value="approved">Aprovados</option>
          <option value="pending">Pendentes</option>
        </select>
        <select
          value={initialFilter.difficulty ?? ''}
          onChange={(e) =>
            router.push(
              buildUrl({
                difficulty: e.target.value ? Number(e.target.value) : null,
                page: 1,
              })
            )
          }
          style={selectStyle}
        >
          <option value="">Todas as dificuldades</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              Dificuldade {n}
            </option>
          ))}
        </select>
        <form onSubmit={submitSearch} style={{ display: 'flex', gap: 6, flex: 1 }}>
          <input
            type="search"
            placeholder="Buscar no front/back…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ ...selectStyle, flex: 1, minWidth: 180 }}
          />
          <button type="submit" style={btnSecondary}>
            Buscar
          </button>
        </form>
      </div>

      {feedback && (
        <div
          style={{
            fontSize: 12,
            color: feedback.startsWith('Erro') ? '#EF5350' : '#66BB6A',
          }}
        >
          {feedback}
        </div>
      )}

      {/* Tabela */}
      <div
        style={{
          background: 'var(--mm-surface)',
          border: '1px solid var(--mm-line)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {result.rows.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              fontSize: 13,
              color: 'var(--mm-muted)',
            }}
          >
            Nenhum flashcard encontrado com esses filtros.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th()}>STATUS</th>
                <th style={th()}>EXAME</th>
                <th style={th()}>TIPO</th>
                <th style={th()}>DIF</th>
                <th style={th()}>FRONT</th>
                <th style={th()}>BACK</th>
                <th style={{ ...th(), textAlign: 'right' }}>AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((c) => {
                const isEditing = editingId === c.id
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--mm-line)' }}>
                    <td style={td()}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: c.approved
                            ? 'rgba(102,187,106,0.15)'
                            : 'rgba(255,167,38,0.15)',
                          color: c.approved ? '#66BB6A' : '#FFA726',
                          letterSpacing: '0.3px',
                        }}
                      >
                        {c.approved ? 'APROVADO' : 'PENDENTE'}
                      </span>
                    </td>
                    <td style={td('var(--mm-muted)')}>{c.exam_label}</td>
                    <td style={td('var(--mm-muted)')}>
                      {(c.card_type ?? '—').toUpperCase()}
                      {c.question_number != null && ` · Q${c.question_number}`}
                    </td>
                    <td style={td()}>{c.difficulty ?? '—'}</td>
                    <td
                      style={{
                        ...td(),
                        maxWidth: isEditing ? undefined : 280,
                        verticalAlign: 'top',
                      }}
                    >
                      {isEditing ? (
                        <RichEditor
                          value={editFront}
                          onChange={setEditFront}
                          placeholder="Pergunta…"
                          minRows={3}
                          ariaLabel="Editar front"
                        />
                      ) : (
                        <PreviewCell html={c.front} />
                      )}
                    </td>
                    <td
                      style={{
                        ...td(),
                        maxWidth: isEditing ? undefined : 360,
                        verticalAlign: 'top',
                      }}
                    >
                      {isEditing ? (
                        <RichEditor
                          value={editBack}
                          onChange={setEditBack}
                          placeholder="Resposta…"
                          minRows={4}
                          ariaLabel="Editar back"
                        />
                      ) : (
                        <PreviewCell html={c.back} />
                      )}
                    </td>
                    <td
                      style={{
                        ...td(),
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                        verticalAlign: 'top',
                      }}
                    >
                      {isEditing ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            alignItems: 'flex-end',
                          }}
                        >
                          <select
                            value={editDifficulty}
                            onChange={(e) => setEditDifficulty(Number(e.target.value))}
                            style={selectStyle}
                          >
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                Dif {n}
                              </option>
                            ))}
                          </select>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={() => save(c)}
                              disabled={pending}
                              style={btnPrimary(!pending)}
                            >
                              Salvar
                            </button>
                            <button onClick={cancelEdit} style={btnGhost}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            alignItems: 'flex-end',
                          }}
                        >
                          <button
                            onClick={() => startEdit(c)}
                            style={btnSecondary}
                            disabled={pending}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => toggleApproval(c)}
                            style={btnGhost}
                            disabled={pending}
                          >
                            {c.approved ? 'Despublicar' : 'Aprovar'}
                          </button>
                          <button
                            onClick={() => remove(c)}
                            style={btnDanger}
                            disabled={pending}
                          >
                            Excluir
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            alignItems: 'center',
            fontSize: 12,
            color: 'var(--mm-muted)',
          }}
        >
          <button
            onClick={() =>
              router.push(buildUrl({ page: Math.max(1, initialFilter.page - 1) }))
            }
            disabled={initialFilter.page <= 1}
            style={btnGhost}
          >
            ← Anterior
          </button>
          <span>
            Página {initialFilter.page} de {totalPages}
          </span>
          <button
            onClick={() =>
              router.push(
                buildUrl({ page: Math.min(totalPages, initialFilter.page + 1) })
              )
            }
            disabled={initialFilter.page >= totalPages}
            style={btnGhost}
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  )
}

function PreviewCell({ html }: { html: string }) {
  if (!html) return <span style={{ color: 'var(--mm-muted)' }}>—</span>
  if (isHtml(html)) {
    return (
      <div
        style={{ fontSize: 12, color: 'var(--mm-text)', lineHeight: 1.4 }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
      />
    )
  }
  return (
    <span
      style={{
        fontSize: 12,
        color: 'var(--mm-text)',
        lineHeight: 1.4,
        whiteSpace: 'pre-wrap',
      }}
    >
      {html}
    </span>
  )
}

function toEditableHtml(text: string): string {
  if (!text) return ''
  if (isHtml(text)) return text
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

const selectStyle: React.CSSProperties = {
  background: 'var(--mm-bg2)',
  border: '1px solid var(--mm-line2)',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12,
  color: 'var(--mm-text)',
}

function btnPrimary(active: boolean): React.CSSProperties {
  return {
    background: active
      ? 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))'
      : 'var(--mm-bg2)',
    color: active ? '#0a0a0a' : 'var(--mm-muted)',
    fontFamily: 'var(--font-syne)',
    fontSize: 11,
    fontWeight: 700,
    padding: '6px 12px',
    borderRadius: 6,
    border: 'none',
    cursor: active ? 'pointer' : 'default',
  }
}

const btnSecondary: React.CSSProperties = {
  background: 'var(--mm-bg2)',
  color: 'var(--mm-text2)',
  border: '1px solid var(--mm-line2)',
  fontSize: 11,
  fontWeight: 600,
  padding: '6px 12px',
  borderRadius: 6,
  cursor: 'pointer',
}

const btnGhost: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--mm-text2)',
  border: '1px solid var(--mm-line2)',
  fontSize: 11,
  fontWeight: 600,
  padding: '6px 12px',
  borderRadius: 6,
  cursor: 'pointer',
}

const btnDanger: React.CSSProperties = {
  background: 'rgba(239,83,80,0.10)',
  color: '#EF5350',
  border: '1px solid rgba(239,83,80,0.4)',
  fontSize: 11,
  fontWeight: 600,
  padding: '6px 12px',
  borderRadius: 6,
  cursor: 'pointer',
}

function th(): React.CSSProperties {
  return {
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--mm-muted)',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    padding: '10px 16px',
    borderBottom: '1px solid var(--mm-line2)',
  }
}

function td(color = 'var(--mm-text)'): React.CSSProperties {
  return { fontSize: 12, padding: '11px 16px', color }
}

// htmlToPlainText is exported for potential future preview shortening; currently unused
void htmlToPlainText
