'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  generateVariationsBatchAction,
  type VariationListRow,
} from './actions'
import type { DifficultyDelta } from '@/lib/variations/generate'

const COST_SONNET = 0.005
const COST_OPUS = 0.02

const DIFFICULTY_LABEL: Record<DifficultyDelta, string> = {
  0: 'Igual à original',
  1: '+1 nível (mais difícil)',
  2: '+2 níveis (muito mais difícil)',
}

export function VariacoesClient({
  rows,
  exams,
  initialFilter,
}: {
  rows: VariationListRow[]
  exams: { id: string; label: string }[]
  initialFilter: { examId: string; onlyPending: boolean }
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)

  const [count, setCount] = useState(3)
  const [difficulty, setDifficulty] = useState<DifficultyDelta>(0)
  const [model, setModel] = useState<'sonnet' | 'opus'>('sonnet')
  const [inheritTags, setInheritTags] = useState(true)

  const allSelected = rows.length > 0 && selected.size === rows.length
  const totalSel = selected.size
  const totalVars = totalSel * count
  const unitCost = model === 'opus' ? COST_OPUS : COST_SONNET
  const estCost = (totalVars * unitCost).toFixed(2)

  const filterUrl = useMemo(
    () => (next: Partial<typeof initialFilter>) => {
      const f = { ...initialFilter, ...next }
      const params = new URLSearchParams()
      if (f.examId) params.set('exam', f.examId)
      if (f.onlyPending) params.set('only_pending', '1')
      return `/variacoes${params.toString() ? `?${params.toString()}` : ''}`
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
    setFeedback(null)
    setShowConfig(false)

    startTransition(async () => {
      const res = await generateVariationsBatchAction(ids, {
        count,
        difficultyDelta: difficulty,
        inheritTags,
        model,
      })
      if (res.ok) {
        setFeedback(
          `${res.queued} questões enfileiradas — gerando ${count} variação${count > 1 ? 'ões' : ''} cada com ${model === 'opus' ? 'Opus' : 'Sonnet'}. Atualize "Revisar pendentes" em alguns segundos.`
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
          Apenas sem variação
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
              {' · '}≈ {totalVars} variações · ${estCost}
            </span>
          )}
        </span>
        <button
          onClick={() => setShowConfig((v) => !v)}
          disabled={totalSel === 0 || pending}
          style={btnPrimary(totalSel > 0 && !pending)}
        >
          {pending ? 'Enfileirando…' : `Gerar variações (${totalSel})`}
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

      {/* Modal config */}
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
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--mm-text2)' }}>
              Variações por questão:&nbsp;
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                style={selectStyle}
              >
                {[1, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'var(--mm-text2)' }}>
              Dificuldade:&nbsp;
              <select
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(Number(e.target.value) as DifficultyDelta)
                }
                style={selectStyle}
              >
                {([0, 1, 2] as DifficultyDelta[]).map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABEL[d]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'var(--mm-text2)' }}>
              Modelo:&nbsp;
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as 'sonnet' | 'opus')}
                style={selectStyle}
              >
                <option value="sonnet">Sonnet (rápido, $0.005/var)</option>
                <option value="opus">Opus (mais criativo, $0.02/var)</option>
              </select>
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
                <th style={th()}>VARIAÇÕES</th>
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
                    {r.variations_count > 0 ? (
                      <span style={{ fontSize: 11, color: '#66BB6A', fontWeight: 600 }}>
                        {r.variations_count}
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
