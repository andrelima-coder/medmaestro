'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

export type LoteRow = {
  id: string
  year: number
  booklet_color: string | null
  status: string
  board: string
  specialty: string
}

const PAGE_SIZE = 6

const STATUS_LABELS: Record<string, string> = {
  pending: 'Aguardando',
  extracting: 'Extraindo',
  classifying: 'Classificando',
  done: 'Concluído',
  published: 'Publicado',
  error: 'Erro',
}

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  done: {
    bg: 'rgba(102,187,106,0.12)',
    color: '#66BB6A',
    border: 'rgba(102,187,106,0.3)',
  },
  published: {
    bg: 'rgba(102,187,106,0.12)',
    color: '#66BB6A',
    border: 'rgba(102,187,106,0.3)',
  },
  extracting: {
    bg: 'rgba(79,195,247,0.12)',
    color: '#4FC3F7',
    border: 'rgba(79,195,247,0.3)',
  },
  classifying: {
    bg: 'var(--mm-gold-bg)',
    color: 'var(--mm-gold)',
    border: 'var(--mm-gold-border)',
  },
  pending: {
    bg: 'rgba(255,152,0,0.12)',
    color: '#FF9800',
    border: 'rgba(255,152,0,0.3)',
  },
  error: {
    bg: 'rgba(239,83,80,0.12)',
    color: '#EF5350',
    border: 'rgba(239,83,80,0.3)',
  },
}

export function LotesTableClient({ exams }: { exams: LoteRow[] }) {
  const [statusFilter, setStatusFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [boardFilter, setBoardFilter] = useState('')
  const [specialtyFilter, setSpecialtyFilter] = useState('')
  const [page, setPage] = useState(1)

  const years = useMemo(
    () => Array.from(new Set(exams.map((e) => e.year))).sort((a, b) => b - a),
    [exams]
  )
  const boards = useMemo(
    () => Array.from(new Set(exams.map((e) => e.board))).sort(),
    [exams]
  )
  const specialties = useMemo(
    () => Array.from(new Set(exams.map((e) => e.specialty))).sort(),
    [exams]
  )

  const filtered = useMemo(() => {
    return exams.filter((e) => {
      if (statusFilter && e.status !== statusFilter) return false
      if (yearFilter && String(e.year) !== yearFilter) return false
      if (boardFilter && e.board !== boardFilter) return false
      if (specialtyFilter && e.specialty !== specialtyFilter) return false
      return true
    })
  }, [exams, statusFilter, yearFilter, boardFilter, specialtyFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageData = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  function actionFor(status: string, examId: string) {
    if (status === 'classifying') {
      return (
        <span
          style={{
            fontSize: 11,
            color: 'var(--mm-muted)',
            padding: '4px 12px',
            border: '1px solid var(--mm-line2)',
            borderRadius: 6,
          }}
        >
          Classificando…
        </span>
      )
    }
    if (status === 'pending_review' || status === 'in_review') {
      return (
        <Link href={`/revisao?exam_id=${examId}`} style={btnGold}>
          Revisar →
        </Link>
      )
    }
    return (
      <Link href={`/lotes/${examId}`} style={btnGhost}>
        Ver →
      </Link>
    )
  }

  return (
    <div
      style={{
        background: 'var(--mm-surface)',
        border: '1px solid var(--mm-line)',
        borderRadius: 12,
        padding: 20,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <span
          className="font-[family-name:var(--font-syne)]"
          style={{ fontSize: 14, fontWeight: 700 }}
        >
          Lotes importados
          <span style={{ marginLeft: 8, color: 'var(--mm-muted)', fontWeight: 500, fontSize: 12 }}>
            ({filtered.length}
            {filtered.length !== exams.length && ` de ${exams.length}`})
          </span>
        </span>
        <Link
          href="/lotes/novo"
          style={{
            background: 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))',
            color: '#0a0a0a',
            fontFamily: 'var(--font-syne)',
            fontSize: 12,
            fontWeight: 700,
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            boxShadow: '0 4px 20px rgba(212,168,67,0.25)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          + Novo lote
        </Link>
      </div>

      {/* Filtros */}
      {exams.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 14,
            flexWrap: 'wrap',
          }}
        >
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            style={selectStyle}
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value)
              setPage(1)
            }}
            style={selectStyle}
          >
            <option value="">Todos os anos</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={boardFilter}
            onChange={(e) => {
              setBoardFilter(e.target.value)
              setPage(1)
            }}
            style={selectStyle}
          >
            <option value="">Todas as bancas</option>
            {boards.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            value={specialtyFilter}
            onChange={(e) => {
              setSpecialtyFilter(e.target.value)
              setPage(1)
            }}
            style={selectStyle}
          >
            <option value="">Todas as especialidades</option>
            {specialties.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {(statusFilter || yearFilter || boardFilter || specialtyFilter) && (
            <button
              onClick={() => {
                setStatusFilter('')
                setYearFilter('')
                setBoardFilter('')
                setSpecialtyFilter('')
                setPage(1)
              }}
              style={{
                fontSize: 11,
                color: 'var(--mm-muted)',
                background: 'transparent',
                border: '1px solid var(--mm-line2)',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Tabela */}
      {pageData.length === 0 ? (
        <p
          style={{
            fontSize: 13,
            color: 'var(--mm-muted)',
            textAlign: 'center',
            padding: '20px 0',
          }}
        >
          {exams.length === 0
            ? 'Nenhum lote importado ainda.'
            : 'Nenhum lote com esses filtros.'}
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['ESPECIALIDADE', 'ANO', 'BANCA', 'COR', 'STATUS', 'AÇÃO'].map((col) => (
                <th key={col} style={th}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.map((e) => {
              const s = STATUS_STYLES[e.status] ?? STATUS_STYLES.pending
              const label = STATUS_LABELS[e.status] ?? e.status
              return (
                <tr key={e.id}>
                  <td style={td('var(--mm-text)')}>{e.specialty}</td>
                  <td style={td()}>{e.year}</td>
                  <td style={td()}>{e.board}</td>
                  <td style={{ ...td(), textTransform: 'capitalize' }}>
                    {e.booklet_color ?? '—'}
                  </td>
                  <td style={td()}>
                    <span
                      style={{
                        background: s.bg,
                        color: s.color,
                        border: `1px solid ${s.border}`,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 20,
                        display: 'inline-block',
                      }}
                    >
                      {label}
                    </span>
                  </td>
                  <td style={{ ...td(), textAlign: 'right' }}>
                    {actionFor(e.status, e.id)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 16,
            paddingTop: 12,
            borderTop: '1px solid var(--mm-line2)',
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: 'var(--mm-muted)',
              padding: '4px 12px',
              border: '1px solid var(--mm-line2)',
              borderRadius: 6,
            }}
          >
            Página {currentPage} de {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            style={btnPager(currentPage > 1)}
          >
            ← Anterior
          </button>
          <button
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            style={btnPager(currentPage < totalPages, true)}
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
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

const th: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--mm-muted)',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  padding: '8px 12px',
  borderBottom: '1px solid var(--mm-line2)',
}

function td(color = 'var(--mm-text2)'): React.CSSProperties {
  return {
    fontSize: 12,
    padding: '11px 12px',
    borderBottom: '1px solid var(--mm-line)',
    color,
  }
}

const btnGhost: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--mm-text2)',
  textDecoration: 'none',
  fontWeight: 600,
  padding: '4px 12px',
  border: '1px solid var(--mm-line2)',
  borderRadius: 6,
  display: 'inline-block',
}

const btnGold: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--mm-gold)',
  textDecoration: 'none',
  fontWeight: 700,
  padding: '4px 12px',
  border: '1px solid var(--mm-gold-border)',
  background: 'var(--mm-gold-bg)',
  borderRadius: 6,
  display: 'inline-block',
}

function btnPager(active: boolean, primary = false): React.CSSProperties {
  if (primary && active) {
    return {
      background: 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))',
      color: '#0a0a0a',
      fontFamily: 'var(--font-syne)',
      fontSize: 11,
      fontWeight: 700,
      padding: '6px 14px',
      borderRadius: 8,
      border: 'none',
      cursor: 'pointer',
    }
  }
  return {
    background: 'var(--mm-bg2)',
    border: '1px solid var(--mm-line2)',
    color: active ? 'var(--mm-text2)' : 'var(--mm-muted)',
    fontFamily: 'var(--font-syne)',
    fontSize: 11,
    fontWeight: 700,
    padding: '6px 14px',
    borderRadius: 8,
    cursor: active ? 'pointer' : 'default',
  }
}
