'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  generateFlashcardsBatchAction,
  type FlashcardsListRow,
} from './actions'
import type { CardType } from '@/lib/flashcards/generate'

const COST_PER_CARD_USD = 0.003

export function FlashcardsClient({
  rows,
  exams,
  initialFilter,
}: {
  rows: FlashcardsListRow[]
  exams: { id: string; label: string }[]
  initialFilter: { examId: string; onlyPending: boolean; lowConf: boolean }
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)

  const [count, setCount] = useState(2)
  const [includeQa, setIncludeQa] = useState(true)
  const [includeCloze, setIncludeCloze] = useState(true)
  const [inheritTags, setInheritTags] = useState(true)

  const allSelected = rows.length > 0 && selected.size === rows.length
  const totalSel = selected.size
  const totalCards = totalSel * count
  const estCost = (totalCards * COST_PER_CARD_USD).toFixed(2)

  const filterUrl = useMemo(
    () => (next: Partial<typeof initialFilter>) => {
      const f = { ...initialFilter, ...next }
      const params = new URLSearchParams()
      if (f.examId) params.set('exam', f.examId)
      if (f.onlyPending) params.set('only_pending', '1')
      if (f.lowConf) params.set('low_conf', '1')
      return `/flashcards${params.toString() ? `?${params.toString()}` : ''}`
    },
    [initialFilter]
  )

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
    const types: CardType[] = []
    if (includeQa) types.push('qa')
    if (includeCloze) types.push('cloze')
    if (types.length === 0) {
      setFeedback('Erro: selecione ao menos um tipo de card')
      return
    }

    setFeedback(null)
    setShowConfig(false)

    startTransition(async () => {
      const res = await generateFlashcardsBatchAction(ids, {
        count,
        types,
        inheritTags,
      })
      if (res.ok) {
        setFeedback(
          `${res.queued} questões enfileiradas — gerando ${count} card(s) cada. Atualize a aba "Revisar pendentes" em alguns segundos.`
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
          {rows.length} questões filtradas
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
          onClick={() => setShowConfig((v) => !v)}
          disabled={totalSel === 0 || pending}
          style={btnPrimary(totalSel > 0 && !pending)}
        >
          {pending ? 'Enfileirando…' : `Gerar flashcards (${totalSel})`}
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

      {/* Config inline (simples) */}
      {showConfig && (
        <div
          style={{
            background: 'var(--mm-surface)',
            border: '1px solid var(--mm-line)',
            borderRadius: 12,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mm-text)' }}>
            Configuração da geração
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--mm-text2)' }}>
              Cards por questão:&nbsp;
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                style={selectStyle}
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label style={checkLabel}>
              <input
                type="checkbox"
                checked={includeQa}
                onChange={(e) => setIncludeQa(e.target.checked)}
              />
              Q&A
            </label>
            <label style={checkLabel}>
              <input
                type="checkbox"
                checked={includeCloze}
                onChange={(e) => setIncludeCloze(e.target.checked)}
              />
              Cloze
            </label>
            <label style={checkLabel}>
              <input
                type="checkbox"
                checked={inheritTags}
                onChange={(e) => setInheritTags(e.target.checked)}
              />
              Herdar tags
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={dispatch} disabled={pending} style={btnPrimary(!pending)}>
              Confirmar e gerar
            </button>
            <button onClick={() => setShowConfig(false)} style={btnGhost}>
              Cancelar
            </button>
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
                <tr key={r.id} style={{ borderBottom: '1px solid var(--mm-line)' }}>
                  <td style={td()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                    />
                  </td>
                  <td style={td('var(--mm-muted)')}>{r.exam_label}</td>
                  <td style={{ ...td('var(--mm-gold)'), fontWeight: 700 }}>
                    Q{r.question_number}
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
