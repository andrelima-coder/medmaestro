'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import {
  saveQuestionContent,
  undoLastEdit,
} from '@/app/(dashboard)/revisao/[id]/content-actions'
import { uploadInlineImage } from '@/app/(dashboard)/revisao/[id]/inline-image-actions'

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

type AlternativesHtml = Partial<Record<(typeof LETTERS)[number], string>>

type ScopeImageUrls = Partial<Record<'statement' | `alternative_${Lowercase<(typeof LETTERS)[number]>}`, string>>

interface QuestionEditorProps {
  questionId: string
  initialStemHtml: string
  initialAlternativesHtml: AlternativesHtml
  correctAnswer: string | null
  readOnly?: boolean
  hasUndoableEdit?: boolean
  /** Signed URLs por scope. Quando a alternativa está vazia mas existe imagem
   * do scope correspondente, renderiza a figura inline. */
  scopeImageUrls?: ScopeImageUrls
}

export function QuestionEditor({
  questionId,
  initialStemHtml,
  initialAlternativesHtml,
  correctAnswer,
  readOnly = false,
  hasUndoableEdit = false,
  scopeImageUrls = {},
}: QuestionEditorProps) {
  const router = useRouter()
  const [stem, setStem] = useState(initialStemHtml)
  const [alts, setAlts] = useState<AlternativesHtml>(initialAlternativesHtml)
  const [pending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)

  function handleUndo() {
    if (!confirm('Desfazer a última edição? O texto atual será substituído pela versão anterior.')) {
      return
    }
    startTransition(async () => {
      const res = await undoLastEdit(questionId)
      if (res.ok) {
        setError(null)
        router.refresh()
      } else {
        setError(res.error ?? 'Falha ao desfazer')
      }
    })
  }

  function scheduleSave() {
    if (readOnly) return
    dirtyRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      startTransition(async () => {
        const res = await saveQuestionContent(questionId, {
          stem_html: stem,
          alternatives_html: alts,
        })
        if (res.ok) {
          setSavedAt(new Date())
          setError(null)
        } else {
          setError(res.error ?? 'Falha ao salvar')
        }
      })
    }, 800)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    scheduleSave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stem, alts])

  const handleUploadImage = useCallback(
    async (file: File): Promise<{ url: string } | { error: string }> => {
      const fd = new FormData()
      fd.set('file', file)
      const res = await uploadInlineImage(questionId, fd)
      if (res.ok && res.url) return { url: res.url }
      return { error: res.error ?? 'Falha no upload' }
    },
    [questionId]
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Enunciado
          </label>
          <div className="flex items-center gap-3">
            {!readOnly && hasUndoableEdit && (
              <button
                type="button"
                onClick={handleUndo}
                disabled={pending}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed underline-offset-2 hover:underline"
              >
                Desfazer última edição
              </button>
            )}
            <SaveStatus pending={pending} savedAt={savedAt} error={error} />
          </div>
        </div>
        {readOnly ? (
          <div
            className="rounded-lg border border-white/5 bg-white/2 px-3 py-2 text-sm text-foreground"
            dangerouslySetInnerHTML={{ __html: stem || '<em>(sem enunciado)</em>' }}
          />
        ) : (
          <RichTextEditor
            value={stem}
            onChange={setStem}
            placeholder="Enunciado da questão…"
            ariaLabel="Editor do enunciado"
            minHeight={120}
            onUploadImage={handleUploadImage}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Alternativas
        </label>
        <div className="flex flex-col gap-2">
          {LETTERS.map((letter) => {
            const isCorrect = correctAnswer === letter
            const html = alts[letter] ?? ''
            const scopeKey = `alternative_${letter.toLowerCase()}` as keyof ScopeImageUrls
            const imageUrl = scopeImageUrls[scopeKey]
            const isImageOnly = !html.trim() && !!imageUrl
            return (
              <div
                key={letter}
                className={`flex gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                  isCorrect
                    ? 'border-green-500/30 bg-green-500/8'
                    : 'border-white/5 bg-white/2'
                }`}
              >
                <span
                  className={`font-semibold shrink-0 pt-1 ${
                    isCorrect ? 'text-green-400' : 'text-muted-foreground'
                  }`}
                  style={{ minWidth: 22 }}
                >
                  {letter})
                </span>
                <div className="flex-1 min-w-0">
                  {isImageOnly ? (
                    <img
                      src={imageUrl}
                      alt={`Alternativa ${letter} (figura)`}
                      className="max-w-full rounded border border-white/5 bg-black/20"
                      style={{ maxHeight: 220 }}
                    />
                  ) : readOnly ? (
                    <div
                      className="text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: html || '<em class="opacity-60">vazia</em>' }}
                    />
                  ) : (
                    <RichTextEditor
                      value={html}
                      onChange={(next) =>
                        setAlts((prev) => ({ ...prev, [letter]: next }))
                      }
                      placeholder={`Alternativa ${letter}`}
                      ariaLabel={`Editor da alternativa ${letter}`}
                      minHeight={48}
                      onUploadImage={handleUploadImage}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SaveStatus({
  pending,
  savedAt,
  error,
}: {
  pending: boolean
  savedAt: Date | null
  error: string | null
}) {
  if (error) return <span className="text-xs text-red-400">{error}</span>
  if (pending) return <span className="text-xs text-muted-foreground">Salvando…</span>
  if (savedAt)
    return (
      <span className="text-xs text-green-400/80">
        Salvo às {savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </span>
    )
  return null
}
