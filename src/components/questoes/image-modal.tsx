'use client'

import { useState, useTransition, useCallback } from 'react'
import type { QuestionImage } from '@/app/(dashboard)/questoes/[id]/image-actions'
import { getSignedImageUrl, toggleImageCrop } from '@/app/(dashboard)/questoes/[id]/image-actions'

const SCOPE_LABELS: Record<string, string> = {
  statement: 'Enunciado',
  alternative_a: 'Alternativa A',
  alternative_b: 'Alternativa B',
  alternative_c: 'Alternativa C',
  alternative_d: 'Alternativa D',
  alternative_e: 'Alternativa E',
}

interface ImageModalProps {
  images: QuestionImage[]
}

export function ImageModal({ images }: ImageModalProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [useCropped, setUseCropped] = useState(() =>
    images.map((img) => img.use_cropped)
  )
  const [isPending, startTransition] = useTransition()

  const activeImage = images[activeIndex]

  const openModal = useCallback(
    async (index: number) => {
      setActiveIndex(index)
      setSignedUrl(null)
      setOpen(true)
      setLoadingUrl(true)
      const img = images[index]
      const path = useCropped[index] && img.cropped_path ? img.cropped_path : img.full_page_path
      const { url } = await getSignedImageUrl(path)
      setSignedUrl(url)
      setLoadingUrl(false)
    },
    [images, useCropped]
  )

  async function switchImage(index: number) {
    setActiveIndex(index)
    setSignedUrl(null)
    setLoadingUrl(true)
    const img = images[index]
    const path = useCropped[index] && img.cropped_path ? img.cropped_path : img.full_page_path
    const { url } = await getSignedImageUrl(path)
    setSignedUrl(url)
    setLoadingUrl(false)
  }

  async function handleToggleCrop(index: number) {
    if (!images[index].cropped_path) return
    const next = !useCropped[index]
    const newUseCropped = [...useCropped]
    newUseCropped[index] = next
    setUseCropped(newUseCropped)

    // Recarrega URL com novo modo
    setSignedUrl(null)
    setLoadingUrl(true)
    const img = images[index]
    const path = next && img.cropped_path ? img.cropped_path : img.full_page_path
    const { url } = await getSignedImageUrl(path)
    setSignedUrl(url)
    setLoadingUrl(false)

    // Persiste no banco em background
    startTransition(async () => {
      await toggleImageCrop(img.id, next)
    })
  }

  if (images.length === 0) return null

  return (
    <>
      {/* Thumbnails / botões de abrir */}
      <div className="flex flex-wrap gap-2 mt-2">
        {images.map((img, i) => (
          <button
            key={img.id}
            onClick={() => openModal(i)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-400 hover:bg-purple-500/20 transition-colors"
          >
            🖼 {SCOPE_LABELS[img.image_scope] ?? img.image_scope}
          </button>
        ))}
      </div>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex flex-col gap-3 rounded-xl border border-white/10 bg-[var(--mm-surface)] p-4 max-w-3xl w-full mx-4 max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-foreground">
                  {SCOPE_LABELS[activeImage?.image_scope] ?? activeImage?.image_scope}
                </span>
                {images.length > 1 && (
                  <div className="flex gap-1">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => switchImage(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          i === activeIndex ? 'bg-[var(--mm-gold)]' : 'bg-white/20 hover:bg-white/40'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                {activeImage?.cropped_path && (
                  <button
                    onClick={() => handleToggleCrop(activeIndex)}
                    disabled={isPending}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                  >
                    {useCropped[activeIndex] ? 'Ver página completa' : 'Ver recortada'}
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Imagem */}
            <div className="flex-1 overflow-auto flex items-center justify-center min-h-0 rounded-lg bg-black/30">
              {loadingUrl ? (
                <p className="text-sm text-muted-foreground animate-pulse">Carregando…</p>
              ) : signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signedUrl}
                  alt={`Imagem — ${SCOPE_LABELS[activeImage?.image_scope] ?? ''}`}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              ) : (
                <p className="text-sm text-red-400">Erro ao carregar imagem.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
