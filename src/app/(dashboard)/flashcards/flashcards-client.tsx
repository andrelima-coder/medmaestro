'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  suggestCountsAction,
  generateFlashcardsInlineAction,
  type FlashcardsListRow,
} from './actions'
import type { CardType } from '@/lib/flashcards/generate'
import { Pagination } from '@/components/ui'

const COST_PER_CARD_USD = 0.003

export function FlashcardsClient({
  rows,
  exams,
  total,
  page,
  pageSize,
  initialFilter,
}: {
  rows: FlashcardsListRow[]
  exams: { id: string; label: string }[]
  total: number
  page: number
  pageSize: number
  initialFilter: { examId: string; onlyPending: boolean; lowConf: boolean }
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [feedbackError, setFeedbackError] = useState(false)

  // Modal de geração
  const [modalOpen, setModalOpen] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [includeQa, setIncludeQa] = useState(true)
  const [includeCloze, setIncludeCloze] = useState(true)
  const [inheritTags, setInheritTags] = useState(true)

  const allSelected = rows.length > 0 && selected.size === rows.length
  const totalSel = selected.size

  const rowById = useMemo(() => {
    const m = new Map<string, FlashcardsListRow>()
    for (const r of rows) m.set(r.id, r)
    return m
  }, [rows])

  const selectedRows = useMemo(
    () => Array.from(selected).map((id) => rowById.get(id)).filter(Boolean) as FlashcardsListRow[],
    [selected, rowById]
  )

  const totalCards = selectedRows.reduce((s, r) => s + (counts[r.id] ?? 2), 0)
  const estCost = (totalCards * COST_PER_CARD_USD).toFixed(2)

  const buildUrl = useMemo(
    () => (next: Partial<typeof initialFilter>, nextPage?: number) => {
      const f = { ...initialFilter, ...next }
      const params = new URLSearchParams()
      if (f.examId) params.set('exam', f.examId)
      if (f.onlyPending) params.set('only_pending', '1')
      if (f.lowConf) params.set('low_conf', '1')
      if (nextPage && nextPage > 1) params.set('page', String(nextPage))
      return `/flashcards${params.toString() ? `?${params.toString()}` : ''}`
    },
    [initialFilter]
  )
  const filterUrl = (next: Partial<typeof initialFilter>) => buildUrl(next)
  const pageUrl = (p: number) => buildUrl({}, p)

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function openModal() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setFeedback(null)
    setModalOpen(true)
    // Pré-preenche com a sugestão da IA (mantém valores já ajustados).
    setSuggesting(true)
    const res = await suggestCountsAction(ids)
    setSuggesting(false)
    if (res.ok && res.counts) {
      setCounts((prev) => {
        const next = { ...prev }
        for (const id of ids) next[id] = prev[id] ?? res.counts![id] ?? 2
        return next
      })
    } else {
      setCounts((prev) => {
        const next = { ...prev }
        for (const id of ids) next[id] = prev[id] ?? 2
        return next
      })
    }
  }

  function setCountFor(id: string, value: number) {
    const v = Math.max(1, Math.min(5, Math.round(value || 1)))
    setCounts((prev) => ({ ...prev, [id]: v }))
  }

  function generate() {
    const types: CardType[] = []
    if (includeQa) types.push('qa')
    if (includeCloze) types.push('cloze')
    if (types.length === 0) {
      setFeedback('Erro: selecione ao menos um tipo de card')
      setFeedbackError(true)
      return
    }

    const items = selectedRows.map((r) => ({ questionId: r.id, count: counts[r.id] ?? 2 }))

    startTransition(async () => {
      const res = await generateFlashcardsInlineAction(items, { types, inheritTags })
      setModalOpen(false)
      if (res.created > 0) {
        setFeedbackError(res.failed > 0)
        setFeedback(
          `${res.created} flashcard(s) criado(s)` +
            (res.failed > 0 ? ` · ${res.failed} questão(ões) falharam` : '') +
            '. Já estão disponíveis na lista e para exportação.'
        )
        setSelected(new Set())
        router.refresh()
      } else {
        setFeedbackError(true)
        setFeedback(
          `Erro: nenhum card gerado.` +
            (res.error ? ` ${res.error}` : res.errors[0] ? ` ${res.errors[0]}` : '')
        )
      }
    })
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
          onChange={(e) => router.push(filterUrl({ examId: e.target.value }))}
          style={selectStyle}
        >
          <option value="">Todos os exames</option>
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>

        <label style={checkLabel}>
          <input
            type="checkbox"
            checked={initialFilter.onlyPending}
            onChange={(e) => router.push(filterUrl({ onlyPending: e.target.checked }))}
          />
          Apenas sem flashcard
        </label>

        <label style={checkLabel}>
          <input
            type="checkbox"
            checked={initialFilter.lowConf}
            onChange={(e) => router.push(filterUrl({ lowConf: e.target.checked }))}
          />
          Baixa confiança (≤2)
        </label>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mm-muted)' }}>
          {total} questões filtradas
        </span>
      </div>

      {/* Action bar */}
      <div
        style={{
          background: 'var(--mm-surface)',
          border: '1px solid var(--mm-line)',
          borderRadius: 12,
          padding: 12,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--mm-text2)' }}>
          {totalSel} selecionada{totalSel === 1 ? '' : 's'}
          {totalSel > 0 && (
            <span style={{ color: 'var(--mm-muted)' }}>
              {' · '}≈ {totalCards} cards · ${estCost}
            </span>
          )}
        </span>
        <button
          onClick={openModal}
          disabled={totalSel === 0 || pending}
          style={btnPrimary(totalSel > 0 && !pending)}
        >
          {pending ? 'Gerando…' : `Gerar flashcards (${totalSel})`}
        </button>

        {feedback && (
          <span
            style={{
              fontSize: 11,
              color: feedbackError ? '#EF5350' : '#66BB6A',
              marginLeft: 8,
            }}
          >
            {feedback}
          </span>
        )}
      </div>

      {/* Modal de geração */}
      {modalOpen && (
        <div
          onClick={() => !pending && setModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--mm-surface)',
              border: '1px solid var(--mm-line2)',
              borderRadius: 12,
              width: 'min(640px, 100%)',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--mm-line)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--mm-text)', fontFamily: 'var(--font-syne)' }}>
                Gerar flashcards
              </div>
              <div style={{ fontSize: 12, color: 'var(--mm-muted)', marginTop: 2 }}>
                A IA analisa enunciado, alternativas (certas e erradas) e o comentário de
                cada questão. Revise a quantidade sugerida por questão.
              </div>
            </div>

            <div style={{ padding: '12px 20px', overflowY: 'auto', flex: 1 }}>
              {suggesting ? (
                <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--mm-muted)' }}>
                  Analisando questões e sugerindo quantidades…
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th()}>Q#</th>
                      <th style={th()}>ENUNCIADO</th>
                      <th style={{ ...th(), textAlign: 'right' }}>CARDS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRows.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--mm-line)' }}>
                        <td style={{ ...td('var(--mm-gold)'), fontWeight: 700, whiteSpace: 'nowrap' }}>
                          Q{r.question_number}
                        </td>
                        <td
                          style={{
                            ...td('var(--mm-text2)'),
                            maxWidth: 360,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.stem || '—'}
                        </td>
                        <td style={{ ...td(), textAlign: 'right' }}>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            value={counts[r.id] ?? 2}
                            onChange={(e) => setCountFor(r.id, Number(e.target.value))}
                            style={{
                              width: 56,
                              background: 'var(--mm-bg2)',
                              border: '1px solid var(--mm-line2)',
                              borderRadius: 8,
                              padding: '5px 8px',
                              fontSize: 12,
                              color: 'var(--mm-text)',
                              textAlign: 'center',
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--mm-line)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={checkLabel}>
                  <input type="checkbox" checked={includeQa} onChange={(e) => setIncludeQa(e.target.checked)} />
                  Q&A
                </label>
                <label style={checkLabel}>
                  <input type="checkbox" checked={includeCloze} onChange={(e) => setIncludeCloze(e.target.checked)} />
                  Cloze
                </label>
                <label style={checkLabel}>
                  <input type="checkbox" checked={inheritTags} onChange={(e) => setInheritTags(e.target.checked)} />
                  Herdar tags (tema + habilidade)
                </label>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mm-muted)' }}>
                  ≈ {totalCards} cards · ${estCost}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={generate} disabled={pending || suggesting} style={btnPrimary(!pending && !suggesting)}>
                  {pending ? 'Gerando…' : 'Gerar agora'}
                </button>
                <button onClick={() => setModalOpen(false)} disabled={pending} style={btnGhost}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
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
        {rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--mm-muted)' }}>
            Nenhuma questão encontrada com esses filtros.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th()}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th style={th()}>EXAME</th>
                <th style={th()}>Q#</th>
                <th style={th()}>ENUNCIADO</th>
                <th style={th()}>CARDS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: '1px solid var(--mm-line)',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input,a')) return
                    window.location.href = `/questoes/${r.id}`
                  }}
                  className="hover:bg-white/[0.02]"
                >
                  <td style={td()} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                    />
                  </td>
                  <td style={td('var(--mm-muted)')}>{r.exam_label}</td>
                  <td style={{ ...td(), padding: 0 }}>
                    <Link
                      href={`/questoes/${r.id}`}
                      style={{
                        display: 'block',
                        padding: '11px 16px',
                        color: 'var(--mm-gold)',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      Q{r.question_number}
                    </Link>
                  </td>
                  <td
                    style={{
                      ...td(),
                      maxWidth: 360,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.stem || '—'}
                  </td>
                  <td style={td()}>
                    {r.flashcards_count > 0 ? (
                      <span style={{ fontSize: 11, color: '#66BB6A', fontWeight: 600 }}>
                        {r.flashcards_count}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--mm-muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} pageSize={pageSize} total={total} hrefForPage={pageUrl} />
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  background: 'var(--mm-bg2)',
  border: '1px solid var(--mm-line2)',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12,
  color: 'var(--mm-text)',
}

const checkLabel: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--mm-text2)',
  display: 'flex',
  gap: 6,
  alignItems: 'center',
}

function btnPrimary(active: boolean): React.CSSProperties {
  return {
    background: active
      ? 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))'
      : 'var(--mm-bg2)',
    color: active ? '#0a0a0a' : 'var(--mm-muted)',
    fontFamily: 'var(--font-syne)',
    fontSize: 12,
    fontWeight: 700,
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    cursor: active ? 'pointer' : 'default',
  }
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
