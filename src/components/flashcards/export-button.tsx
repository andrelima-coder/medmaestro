'use client'

import { useEffect, useRef, useState } from 'react'

type Format = 'tsv' | 'csv' | 'json'

const FORMAT_LABEL: Record<Format, string> = {
  tsv: 'TSV (Anki)',
  csv: 'CSV (planilha)',
  json: 'JSON',
}

export function ExportFlashcardsButton({
  examId,
  approvedOnly = true,
  label = 'Exportar',
}: {
  examId?: string
  approvedOnly?: boolean
  label?: string
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
    return `/api/flashcards/export?${params.toString()}`
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'var(--mm-bg2)',
          border: '1px solid var(--mm-line2)',
          color: 'var(--mm-text)',
          fontFamily: 'var(--font-syne)',
          fontSize: 12,
          fontWeight: 700,
          padding: '8px 14px',
          borderRadius: 8,
          cursor: 'pointer',
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
          {(['tsv', 'csv', 'json'] as Format[]).map((fmt) => (
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
              className="hover:bg-white/[0.04]"
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
            {approvedOnly ? 'Apenas aprovados' : 'Todos (incluindo pendentes)'}
            {examId ? ' · exame filtrado' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
