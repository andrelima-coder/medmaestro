'use client'

import { useRef, useEffect, useCallback } from 'react'

type RichTextEditorProps = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  ariaLabel?: string
}

const TOOLBAR_BUTTONS: Array<{
  label: string
  command: string
  arg?: string
  title: string
}> = [
  { label: 'B', command: 'bold', title: 'Negrito (Ctrl+B)' },
  { label: 'I', command: 'italic', title: 'Itálico (Ctrl+I)' },
  { label: 'U', command: 'underline', title: 'Sublinhado (Ctrl+U)' },
  { label: '•', command: 'insertUnorderedList', title: 'Lista' },
  { label: '1.', command: 'insertOrderedList', title: 'Lista numerada' },
  { label: 'x²', command: 'superscript', title: 'Sobrescrito' },
  { label: 'x₂', command: 'subscript', title: 'Subscrito' },
  { label: '↶', command: 'undo', title: 'Desfazer' },
  { label: '↷', command: 'redo', title: 'Refazer' },
]

export function RichTextEditor({
  value,
  onChange,
  placeholder = '',
  minHeight = 80,
  ariaLabel,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const lastValueRef = useRef<string>(value)

  useEffect(() => {
    if (!editorRef.current) return
    if (value !== lastValueRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value || ''
      lastValueRef.current = value
    }
  }, [value])

  const emit = useCallback(() => {
    if (!editorRef.current) return
    const html = editorRef.current.innerHTML
    lastValueRef.current = html
    onChange(html)
  }, [onChange])

  function exec(command: string, arg?: string) {
    document.execCommand(command, false, arg)
    editorRef.current?.focus()
    emit()
  }

  return (
    <div className="rounded-lg border border-white/8 bg-white/4 focus-within:border-[var(--mm-gold)]/40 transition-colors">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/8 px-2 py-1.5">
        {TOOLBAR_BUTTONS.map((b) => (
          <button
            key={b.command + (b.arg ?? '')}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(b.command, b.arg)}
            title={b.title}
            className="px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/8 rounded transition-colors min-w-[28px]"
          >
            {b.label}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        className="rich-editor-content px-3 py-2 text-sm text-foreground outline-none whitespace-pre-wrap"
        style={{ minHeight }}
        dangerouslySetInnerHTML={{ __html: value || '' }}
      />
      <style jsx>{`
        .rich-editor-content[data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: var(--mm-muted);
          opacity: 0.6;
          pointer-events: none;
        }
        .rich-editor-content :global(ul) {
          list-style: disc;
          padding-left: 1.4rem;
        }
        .rich-editor-content :global(ol) {
          list-style: decimal;
          padding-left: 1.4rem;
        }
        .rich-editor-content :global(strong) {
          font-weight: 700;
        }
        .rich-editor-content :global(em) {
          font-style: italic;
        }
        .rich-editor-content :global(u) {
          text-decoration: underline;
        }
        .rich-editor-content :global(sub),
        .rich-editor-content :global(sup) {
          font-size: 0.75em;
        }
      `}</style>
    </div>
  )
}
