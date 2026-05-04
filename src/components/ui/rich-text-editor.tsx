'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { sanitizeRichTextHtml } from '@/lib/utils/sanitize-html'

type RichTextEditorProps = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  ariaLabel?: string
  onUploadImage?: (file: File) => Promise<{ url: string } | { error: string }>
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
  onUploadImage,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const lastValueRef = useRef<string>(value)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

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

  function insertImage(url: string) {
    editorRef.current?.focus()
    const ok = document.execCommand('insertImage', false, url)
    if (!ok && editorRef.current) {
      const img = document.createElement('img')
      img.src = url
      img.alt = ''
      editorRef.current.appendChild(img)
    }
    emit()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !onUploadImage) return
    setUploading(true)
    setUploadError(null)
    try {
      const res = await onUploadImage(file)
      if ('url' in res) {
        insertImage(res.url)
      } else {
        setUploadError(res.error || 'Falha no upload')
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
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
        {onUploadImage && (
          <>
            <span className="mx-1 h-4 w-px bg-white/10" aria-hidden />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Inserir imagem"
              className="px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/8 rounded transition-colors min-w-[28px] disabled:opacity-40"
            >
              {uploading ? '…' : '🖼'}
            </button>
            {uploadError && (
              <span className="text-[10px] text-red-400 ml-1" title={uploadError}>
                erro
              </span>
            )}
          </>
        )}
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
        dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(value) }}
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
        .rich-editor-content :global(img) {
          max-width: 100%;
          height: auto;
          border-radius: 6px;
          margin: 6px 0;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  )
}
