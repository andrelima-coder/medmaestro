'use client'

import { useState, useTransition, useRef } from 'react'
import {
  uploadQuestionAttachment,
  deleteQuestionAttachment,
  type QuestionAttachment,
} from '@/app/(dashboard)/revisao/[id]/attachment-actions'

interface AttachmentsPanelProps {
  questionId: string
  initial: QuestionAttachment[]
  readOnly?: boolean
}

export function AttachmentsPanel({
  questionId,
  initial,
  readOnly = false,
}: AttachmentsPanelProps) {
  const [items, setItems] = useState<QuestionAttachment[]>(initial)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  function handleSelect() {
    fileRef.current?.click()
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.set('file', file)
    if (caption) fd.set('caption', caption)
    startTransition(async () => {
      setError(null)
      const res = await uploadQuestionAttachment(questionId, fd)
      if (res.ok && res.attachment) {
        setItems((prev) => [res.attachment as QuestionAttachment, ...prev])
        setCaption('')
        if (fileRef.current) fileRef.current.value = ''
      } else {
        setError(res.error ?? 'Falha no upload')
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Excluir este anexo?')) return
    startTransition(async () => {
      const res = await deleteQuestionAttachment(id)
      if (res.ok) setItems((prev) => prev.filter((a) => a.id !== id))
      else setError(res.error ?? 'Falha ao excluir')
    })
  }

  return (
    <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/40 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Anexos do revisor
        </h3>
        {!readOnly && (
          <span className="text-[10px] text-muted-foreground">
            PNG, JPG, WebP ou PDF · até 10 MB
          </span>
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-white/10 bg-white/2 p-3">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Legenda opcional (ex.: ECG correto da Q12)"
            className="w-full rounded-md border border-white/8 bg-white/4 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-[var(--mm-gold)]/40"
          />
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={handleChange}
            />
            <button
              type="button"
              onClick={handleSelect}
              disabled={pending}
              className="rounded-md border border-white/8 bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {pending ? 'Enviando…' : 'Selecionar arquivo'}
            </button>
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sem anexos.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-3 rounded-lg border border-white/7 bg-white/2 p-2.5"
            >
              {a.mime_type.startsWith('image/') ? (
                <a
                  href={a.signed_url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 block w-16 h-16 rounded-md overflow-hidden bg-black/30 border border-white/10"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.signed_url}
                    alt={a.file_name}
                    className="w-full h-full object-cover"
                  />
                </a>
              ) : (
                <a
                  href={a.signed_url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 flex items-center justify-center w-16 h-16 rounded-md bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-400"
                >
                  PDF
                </a>
              )}
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <a
                  href={a.signed_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-foreground hover:text-[var(--mm-gold)] truncate"
                >
                  {a.file_name}
                </a>
                {a.caption && (
                  <p className="text-xs text-muted-foreground">{a.caption}</p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  {formatBytes(a.size_bytes)}
                  {a.uploaded_by_name && ` · ${a.uploaded_by_name}`}
                  {' · '}
                  {new Date(a.created_at).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  disabled={pending}
                  className="shrink-0 px-2 py-1 text-xs text-red-400/70 hover:text-red-400 transition-colors"
                  title="Excluir anexo"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
