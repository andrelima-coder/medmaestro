'use client'

import { useState, useTransition, useCallback, useEffect, useRef } from 'react'
import type { QuestionImage } from '@/app/(dashboard)/questoes/[id]/image-actions'
import { getSignedImageUrl, toggleImageCrop } from '@/app/(dashboard)/questoes/[id]/image-actions'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const ZOOM_STEP = 0.25

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
  /** URLs assinadas (uma por imagem, na mesma ordem) para preview inline.
   * Quando presente, mostra a figura visível e clicável; senão, um chip. */
  previewUrls?: (string | null)[]
  /** Esconde o rótulo do escopo no preview (já está ancorado no box certo). */
  hideScopeLabel?: boolean
  /** Alinhamento do preview inline. Enunciado → 'center'; alternativas → 'left'. */
  align?: 'left' | 'center'
}

/** Dimensões mínimas/iniciais da janela de zoom (px). */
const MODAL_MIN_W = 360
const MODAL_MIN_H = 320

export function ImageModal({
  images,
  previewUrls,
  hideScopeLabel = false,
  align = 'left',
}: ImageModalProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [useCropped, setUseCropped] = useState(() =>
    images.map((img) => img.use_cropped)
  )
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Tamanho da janela de zoom (null = tamanho padrão responsivo). Ao arrastar
  // qualquer canto, passamos a controlar largura/altura em pixels.
  const [modalSize, setModalSize] = useState<{ w: number; h: number } | null>(null)
  const resizeRef = useRef<{
    startX: number
    startY: number
    baseW: number
    baseH: number
    dirX: 1 | -1
    dirY: 1 | -1
  } | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [isPending, startTransition] = useTransition()

  const activeImage = images[activeIndex]

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))
      else if (e.key === '-') setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))
      else if (e.key === '0') setZoom(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function resetZoom() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  useEffect(() => {
    if (zoom <= 1) setPan({ x: 0, y: 0 })
  }, [zoom])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (zoom <= 1) return
    e.preventDefault()
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y }
    setIsDragging(true)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    const { startX, startY, baseX, baseY } = dragRef.current
    setPan({ x: baseX + (e.clientX - startX), y: baseY + (e.clientY - startY) })
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    try {
      ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
    } catch {}
    dragRef.current = null
    setIsDragging(false)
  }

  // ---- Redimensionamento da janela arrastando os cantos ----
  function startResize(dirX: 1 | -1, dirY: 1 | -1) {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
      const box = e.currentTarget.closest('[data-modal-box]') as HTMLElement | null
      const rect = box?.getBoundingClientRect()
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseW: rect?.width ?? MODAL_MIN_W,
        baseH: rect?.height ?? MODAL_MIN_H,
        dirX,
        dirY,
      }
      setIsResizing(true)
    }
  }

  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = resizeRef.current
    if (!r) return
    const maxW = window.innerWidth - 32
    const maxH = window.innerHeight - 32
    const w = Math.min(maxW, Math.max(MODAL_MIN_W, r.baseW + r.dirX * (e.clientX - r.startX) * 2))
    const h = Math.min(maxH, Math.max(MODAL_MIN_H, r.baseH + r.dirY * (e.clientY - r.startY) * 2))
    setModalSize({ w, h })
  }

  function endResize(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return
    try {
      ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
    } catch {}
    resizeRef.current = null
    setIsResizing(false)
  }

  const openModal = useCallback(
    async (index: number) => {
      setActiveIndex(index)
      setSignedUrl(null)
      setOpen(true)
      setLoadingUrl(true)
      setModalSize(null)
      resetZoom()
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
    resetZoom()
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
      {/* Preview inline da figura (clicável → zoom). Fallback: chip.
          Enunciado → centralizado; alternativas → alinhado à esquerda. */}
      <div
        className={`flex flex-wrap gap-2 mt-2 ${
          align === 'center' ? 'justify-center' : 'justify-start'
        }`}
      >
        {images.map((img, i) => {
          const preview = previewUrls?.[i]
          if (preview) {
            return (
              <button
                key={img.id}
                onClick={() => openModal(i)}
                title="Clique para ampliar"
                className="group block overflow-hidden rounded-lg border border-[rgba(14,40,65,0.12)] bg-[rgba(14,40,65,0.05)] transition-colors hover:border-[var(--mm-gold)]/50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt={SCOPE_LABELS[img.image_scope] ?? img.image_scope}
                  className="max-h-44 max-w-full object-contain bg-white"
                />
                {!hideScopeLabel && (
                  <span className="block px-2 py-1 text-left text-[11px] text-muted-foreground">
                    🖼 {SCOPE_LABELS[img.image_scope] ?? img.image_scope} · clique para ampliar
                  </span>
                )}
              </button>
            )
          }
          return (
            <button
              key={img.id}
              onClick={() => openModal(i)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(123,63,160,0.3)] bg-[rgba(123,63,160,0.1)] px-2.5 py-1 text-xs font-medium text-[#7B3FA0] hover:bg-[rgba(123,63,160,0.2)] transition-colors"
            >
              🖼 {SCOPE_LABELS[img.image_scope] ?? img.image_scope}
            </button>
          )
        })}
      </div>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            data-modal-box
            className={`relative flex flex-col gap-3 rounded-xl border border-[rgba(14,40,65,0.12)] bg-[var(--mm-surface)] p-4 mx-4 ${
              modalSize ? '' : 'max-w-3xl w-full max-h-[90vh]'
            }`}
            style={
              modalSize
                ? { width: modalSize.w, height: modalSize.h }
                : undefined
            }
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
                          i === activeIndex ? 'bg-[var(--mm-gold)]' : 'bg-[rgba(14,40,65,0.2)] hover:bg-[rgba(14,40,65,0.4)]'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 rounded-md border border-[rgba(14,40,65,0.12)] bg-[rgba(14,40,65,0.05)] px-1 py-0.5">
                  <button
                    onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
                    disabled={zoom <= ZOOM_MIN}
                    className="px-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Diminuir zoom"
                  >
                    −
                  </button>
                  <button
                    onClick={resetZoom}
                    className="min-w-[3.5rem] text-center text-xs tabular-nums text-muted-foreground hover:text-foreground"
                    aria-label="Resetar zoom"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
                    disabled={zoom >= ZOOM_MAX}
                    className="px-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Aumentar zoom"
                  >
                    +
                  </button>
                </div>
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
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Imagem */}
            <div
              className="flex-1 overflow-hidden flex items-center justify-center min-h-0 rounded-lg bg-[rgba(14,40,65,0.06)] select-none touch-none"
              style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
              onWheel={(e) => {
                if (!signedUrl) return
                e.preventDefault()
                setZoom((z) => {
                  const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
                  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta))
                })
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {loadingUrl ? (
                <p className="text-sm text-muted-foreground animate-pulse">Carregando…</p>
              ) : signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signedUrl}
                  alt={`Imagem — ${SCOPE_LABELS[activeImage?.image_scope] ?? ''}`}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                    transition: isDragging ? 'none' : 'transform 120ms ease-out',
                    pointerEvents: 'none',
                  }}
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                />
              ) : (
                <p className="text-sm text-[#D3402A]">Erro ao carregar imagem.</p>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground/60 text-center">
              + / − zoom · 0 reset · Esc fechar · scroll para zoom · arraste para mover ·
              cantos para redimensionar
            </p>

            {/* Alças de redimensionamento nos 4 cantos */}
            {(
              [
                ['nw', -1, -1, 'top-0 left-0 cursor-nwse-resize'],
                ['ne', 1, -1, 'top-0 right-0 cursor-nesw-resize'],
                ['sw', -1, 1, 'bottom-0 left-0 cursor-nesw-resize'],
                ['se', 1, 1, 'bottom-0 right-0 cursor-nwse-resize'],
              ] as const
            ).map(([key, dx, dy, pos]) => (
              <div
                key={key}
                onPointerDown={startResize(dx, dy)}
                onPointerMove={onResizeMove}
                onPointerUp={endResize}
                onPointerCancel={endResize}
                className={`absolute z-10 h-5 w-5 ${pos}`}
                style={{ touchAction: 'none' }}
                aria-hidden
              >
                <span className="pointer-events-none absolute inset-1 rounded-sm border border-[rgba(14,40,65,0.3)]" />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
