'use client'

import { useEffect, useRef } from 'react'

type Props = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minRows?: number
  ariaLabel?: string
}

const TOOLBAR_BTNS: { cmd: string; arg?: string; label: string; title: string }[] = [
  { cmd: 'bold', label: 'B', title: 'Negrito (Ctrl/⌘+B)' },
  { cmd: 'italic', label: 'I', title: 'Itálico (Ctrl/⌘+I)' },
  { cmd: 'underline', label: 'U', title: 'Sublinhado (Ctrl/⌘+U)' },
  { cmd: 'formatBlock', arg: 'h3', label: 'H', title: 'Cabeçalho' },
  { cmd: 'insertUnorderedList', label: '•', title: 'Lista' },
  { cmd: 'insertOrderedList', label: '1.', title: 'Lista numerada' },
  { cmd: 'formatBlock', arg: 'p', label: '¶', title: 'Parágrafo normal' },
  { cmd: 'removeFormat', label: '⌫', title: 'Limpar formatação' },
]

export function RichEditor({
  value,
  onChange,
  placeholder,
  minRows = 3,
  ariaLabel,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.innerHTML !== value) el.innerHTML = value || ''
  }, [value])

  function exec(cmd: string, arg?: string) {
    if (typeof document === 'undefined') return
    document.execCommand(cmd, false, arg)
    if (ref.current) onChange(ref.current.innerHTML)
    ref.current?.focus()
  }

  function handleInput() {
    if (ref.current) onChange(ref.current.innerHTML)
  }

  function insertLink() {
    const url = window.prompt('URL do link (https://...)')
    if (!url) return
    exec('createLink', url)
  }

  return (
    <div
      style={{
        background: 'var(--mm-bg2)',
        border: '1px solid var(--mm-line2)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div
        role="toolbar"
        aria-label="Formatação"
        style={{
          display: 'flex',
          gap: 2,
          padding: 4,
          borderBottom: '1px solid var(--mm-line2)',
          background: 'var(--mm-surface)',
          flexWrap: 'wrap',
        }}
      >
        {TOOLBAR_BTNS.map((b, i) => (
          <button
            key={i}
            type="button"
            title={b.title}
            onMouseDown={(e) => {
              e.preventDefault()
              exec(b.cmd, b.arg)
            }}
            style={toolbarBtnStyle}
          >
            <span
              style={{
                fontWeight: b.cmd === 'bold' ? 700 : 500,
                fontStyle: b.cmd === 'italic' ? 'italic' : 'normal',
                textDecoration: b.cmd === 'underline' ? 'underline' : 'none',
              }}
            >
              {b.label}
            </span>
          </button>
        ))}
        <button
          type="button"
          title="Inserir link"
          onMouseDown={(e) => {
            e.preventDefault()
            insertLink()
          }}
          style={toolbarBtnStyle}
        >
          🔗
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        className="mm-rich-editor"
        style={{
          minHeight: `${minRows * 24}px`,
          padding: 10,
          fontSize: 14,
          color: 'var(--mm-text)',
          lineHeight: 1.5,
          outline: 'none',
        }}
      />
      <style jsx>{`
        .mm-rich-editor:empty:before {
          content: attr(data-placeholder);
          color: var(--mm-muted);
          pointer-events: none;
        }
        .mm-rich-editor :global(p) {
          margin: 0 0 0.5em 0;
        }
        .mm-rich-editor :global(p:last-child) {
          margin-bottom: 0;
        }
        .mm-rich-editor :global(ul),
        .mm-rich-editor :global(ol) {
          margin: 0.25em 0 0.5em 1.5em;
          padding: 0;
        }
        .mm-rich-editor :global(h3) {
          font-size: 1.05em;
          font-weight: 700;
          margin: 0.5em 0 0.25em 0;
        }
        .mm-rich-editor :global(a) {
          color: var(--mm-gold);
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}

const toolbarBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid transparent',
  color: 'var(--mm-text2)',
  fontSize: 12,
  fontWeight: 600,
  width: 28,
  height: 28,
  borderRadius: 4,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}
