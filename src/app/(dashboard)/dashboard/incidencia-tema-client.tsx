'use client'

import { useMemo, useState } from 'react'
import { Card, CardBody, CardHeader, CardTitle, ParetoBar } from '@/components/ui'

export type TemaRow = {
  label: string
  year: number
  board: string
}

export function IncidenciaTemaClient({
  rows,
  colors,
  order,
}: {
  /** Uma linha por tag de módulo (question_tag), já com ano e banca da questão. */
  rows: TemaRow[]
  /** Mapa label -> cor (single source: MODULOS na page). */
  colors: Record<string, string>
  /** Ordem canônica dos módulos (para fallback de cor/label). */
  order: string[]
}) {
  const [board, setBoard] = useState('')
  const [years, setYears] = useState<number[]>([])

  const allBoards = useMemo(
    () => Array.from(new Set(rows.map((r) => r.board))).sort(),
    [rows]
  )

  // Anos disponíveis dependem da banca selecionada: cada banca tem cadernos de
  // anos diferentes. Sem banca, mostra todos os anos do banco.
  const availableYears = useMemo(
    () =>
      Array.from(
        new Set(
          rows.filter((r) => !board || r.board === board).map((r) => r.year)
        )
      ).sort((a, b) => b - a),
    [rows, board]
  )

  // Garante que só anos válidos para a banca atual contam (evita seleção órfã
  // ao trocar de banca).
  const effectiveYears = useMemo(
    () => years.filter((y) => availableYears.includes(y)),
    [years, availableYears]
  )

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (board && r.board !== board) return false
        if (effectiveYears.length > 0 && !effectiveYears.includes(r.year))
          return false
        return true
      }),
    [rows, board, effectiveYears]
  )

  const { top8, total } = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of filtered) counts[r.label] = (counts[r.label] ?? 0) + 1
    const data = order.map((label) => ({
      label,
      color: colors[label] ?? '#A4A3A4',
      count: counts[label] ?? 0,
    }))
    const sorted = [...data].sort((a, b) => b.count - a.count)
    return { top8: sorted.slice(0, 8), total: filtered.length }
  }, [filtered, order, colors])

  function toggleYear(y: number) {
    setYears((prev) =>
      prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y]
    )
  }

  const hasFilters = Boolean(board) || effectiveYears.length > 0

  // Resumo do escopo atual (banca + anos)
  const yearsLabel =
    effectiveYears.length === 0
      ? 'todos os anos'
      : [...effectiveYears].sort((a, b) => a - b).join(', ')
  const boardLabel = board || 'todas as bancas'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Incidência por tema</CardTitle>
        <span
          className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold"
          style={{
            background: 'var(--mm-gold-bg)',
            color: 'var(--mm-gold)',
            borderColor: 'var(--mm-gold-border)',
          }}
        >
          Top 8
        </span>
      </CardHeader>
      <CardBody>
        {/* Filtros: banca (única) + anos (multi-seleção) */}
        {rows.length > 0 && (
          <div className="mb-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={board}
                onChange={(e) => {
                  setBoard(e.target.value)
                  setYears([]) // troca de banca reseta os anos disponíveis
                }}
                style={selectStyle}
                aria-label="Filtrar por banca"
              >
                <option value="">Todas as bancas</option>
                {allBoards.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap items-center gap-1.5">
                {availableYears.map((y) => {
                  const active = effectiveYears.includes(y)
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => toggleYear(y)}
                      aria-pressed={active}
                      style={yearChip(active)}
                    >
                      {y}
                    </button>
                  )
                })}
              </div>

              {hasFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setBoard('')
                    setYears([])
                  }}
                  style={clearBtn}
                >
                  Limpar
                </button>
              )}
            </div>

            <p className="text-[11px] text-[var(--mm-muted)]">
              {boardLabel} · {yearsLabel} ·{' '}
              <span className="text-[var(--mm-text2)]">
                {total.toLocaleString('pt-BR')} classificações
              </span>
            </p>
          </div>
        )}

        {total === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--mm-muted)]">
            {rows.length === 0
              ? 'Nenhuma questão classificada ainda'
              : 'Nenhuma questão classificada com esses filtros'}
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {top8.map((m) => {
              const pct = total > 0 ? Math.round((m.count / total) * 100) : 0
              return (
                <ParetoBar
                  key={m.label}
                  module={m.label}
                  count={m.count}
                  widthPct={pct}
                  percentLabel={`${pct}%`}
                  color={m.color}
                />
              )
            })}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

const selectStyle: React.CSSProperties = {
  background: 'var(--mm-bg2)',
  border: '1px solid var(--mm-line2)',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 11,
  color: 'var(--mm-text)',
}

function yearChip(active: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    background: active ? 'var(--mm-gold-bg)' : 'var(--mm-bg2)',
    color: active ? 'var(--mm-gold)' : 'var(--mm-muted)',
    border: `1px solid ${active ? 'var(--mm-gold-border)' : 'var(--mm-line2)'}`,
  }
}

const clearBtn: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--mm-muted)',
  background: 'transparent',
  border: '1px solid var(--mm-line2)',
  borderRadius: 6,
  padding: '6px 10px',
  cursor: 'pointer',
}
