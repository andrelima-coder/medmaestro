'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { generateCommentsBatchAction, type CommentRow } from './actions'

const COST_PER_COMMENT_USD = 0.015

export function ComentariosClient({
  rows,
  exams,
  initialFilter,
}: {
  rows: CommentRow[]
  exams: { id: string; label: string }[]
  initialFilter: { examId: string; onlyPending: boolean; lowConf: boolean }
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  const allSelected = rows.length > 0 && selected.size === rows.length
  const totalSel = selected.size
  const estCost = (totalSel * COST_PER_COMMENT_USD).toFixed(2)

  const filterUrl = useMemo(() => (next: Partial<typeof initialFilter>) => {
    const f = { ...initialFilter, ...next }
    const params = new URLSearchParams()
    if (f.examId) params.set('exam', f.examId)
    if (f.onlyPending) params.set('only_pending', '1')
    if (f.lowConf) params.set('low_conf', '1')
    return `/comentarios${params.toString() ? `?${params.toString()}` : ''}`
  }, [initialFilter])

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

  async function dispatch() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setFeedback(null)
    startTransition(async () => {
      const res = await generateCommentsBatchAction(ids)
      if (res.ok) {
        setFeedback(
          `${res.queued} comentários enfileirados — eles aparecem em segundos. Atualize esta página para ver o status.`
        )
        setSelected(new Set())
        setTimeout(() => router.refresh(), 8000)
      } else {
        setFeedback(`Erro: ${res.error}`)
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
          style={{
            background: 'var(--mm-bg2)',
            border: '1px solid var(--mm-line2)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            color: 'var(--mm-text)',
            minWidth: 220,
          }}
        >
          <option value="">Todos os exames</option>
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>

        <label style={{ fontSize: 12, color: 'var(--mm-text2)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={initialFilter.onlyPending}
            onChange={(e) => router.push(filterUrl({ onlyPending: e.target.checked }))}
          />
          Apenas sem comentário
        </label>

        <label style={{ fontSize: 12, color: 'var(--mm-text2)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={initialFilter.lowConf}
            onChange={(e) => router.push(filterUrl({ lowConf: e.target.checked }))}
          />
          Apenas baixa confiança (≤2)
        </label>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mm-muted)' }}>
          {rows.length} questões filtradas
        </span>
      </div>

      {/* Barra de ação */}
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
              {' · '}≈ ${estCost} ({COST_PER_COMMENT_USD}/Q)
            </span>
          )}
        </span>
        <button
          onClick={dispatch}
          disabled={totalSel === 0 || pending}
          style={{
            background:
              totalSel > 0 && !pending
                ? 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))'
                : 'var(--mm-bg2)',
            color: totalSel > 0 && !pending ? '#0a0a0a' : 'var(--mm-muted)',
            fontFamily: 'var(--font-syne)',
            fontSize: 12,
            fontWeight: 700,
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            cursor: totalSel > 0 && !pending ? 'pointer' : 'default',
          }}
        >
          {pending ? 'Enfileirando…' : `Gerar comentários (${totalSel})`}
        </button>

        {feedback && (
          <span
            style={{
              fontSize: 11,
              color: feedback.startsWith('Erro') ? '#EF5350' : '#66BB6A',
              marginLeft: 8,
            }}
          >
            {feedback}
          </span>
        )}
      </div>

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
                <th style={th()}>CONF.</th>
                <th style={th()}>COMENTÁRIO</th>
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
                  <td style={td('var(--mm-text2)')}>
                    {r.extraction_confidence != null ? `${r.extraction_confidence}/5` : '—'}
                  </td>
                  <td style={td()}>
                    {r.has_comment ? (
                      <span style={{ fontSize: 11, color: '#66BB6A', fontWeight: 600 }}>✓ Tem</span>
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
    </div>
  )
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
