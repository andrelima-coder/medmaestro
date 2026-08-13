'use client'

import { useEffect, useRef, useState } from 'react'

type Format = 'docx' | 'pdf' | 'tsv' | 'csv' | 'json'

const FORMAT_LABEL: Record<Format, string> = {
  docx: 'Word (.docx)',
  pdf: 'PDF',
  tsv: 'TSV (Anki)',
  csv: 'CSV (planilha)',
  json: 'JSON',
}

const FORMATS: Format[] = ['docx', 'pdf', 'tsv', 'csv', 'json']

export function ExportFlashcardsButton({
  examId,
  approvedOnly = true,
  label = 'Exportar',
  ids,
  disabled = false,
}: {
  examId?: string
  approvedOnly?: boolean
  label?: string
  /** Quando informado, exporta apenas estes flashcards (seleção via checkbox). */
  ids?: string[]
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function buildHref(format: Format): string {
    const params = new URLSearchParams({ format })
    if (examId) params.set('exam_id', examId)
    if (!approvedOnly) params.set('approved_only', '0')
    if (ids && ids.length > 0) params.set('ids', ids.join(','))
    return `/api/flashcards/export?${params.toString()}`
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        style={{
          background: 'var(--mm-bg2)',
          border: '1px solid var(--mm-line2)',
          color: disabled ? 'var(--mm-muted)' : 'var(--mm-text)',
          fontFamily: 'var(--font-syne)',
          fontSize: 12,
          fontWeight: 700,
          padding: '8px 14px',
          borderRadius: 8,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {label} ▾
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            background: 'var(--mm-surface)',
            border: '1px solid var(--mm-line2)',
            borderRadius: 8,
            padding: 4,
            minWidth: 180,
            zIndex: 50,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {FORMATS.map((fmt) => (
            <a
              key={fmt}
              href={buildHref(fmt)}
              onClick={() => setOpen(false)}
              style={{
                display: 'block',
                padding: '8px 12px',
                fontSize: 12,
                color: 'var(--mm-text)',
                textDecoration: 'none',
                borderRadius: 6,
              }}
              className="hover:bg-[rgba(14,40,65,0.04)]"
            >
              {FORMAT_LABEL[fmt]}
            </a>
          ))}
          <div
            style={{
              borderTop: '1px solid var(--mm-line)',
              padding: '6px 12px',
              fontSize: 10,
              color: 'var(--mm-muted)',
              lineHeight: 1.4,
            }}
          >
            {ids && ids.length > 0
              ? `${ids.length} selecionado${ids.length === 1 ? '' : 's'}`
              : approvedOnly
                ? 'Apenas aprovados'
                : 'Todos (incluindo pendentes)'}
            {examId && !(ids && ids.length > 0) ? ' · exame filtrado' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
