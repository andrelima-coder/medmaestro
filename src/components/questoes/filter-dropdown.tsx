'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FilterOption = { slug: string; label: string; color?: string | null }

interface FilterDropdownProps {
  label: string
  /** Chave na URL (ex.: 'modulo', 'year', 'status'). */
  urlKey: string
  /** Rota base para onde os filtros são empurrados (ex.: '/questoes', '/analise'). */
  basePath: string
  options: FilterOption[]
  /** true = seleção única (radio); false/omitido = múltipla (checkbox CSV). */
  single?: boolean
  /** Mostra um quadradinho de cor ao lado de cada opção. */
  colored?: boolean
  /** Acima de quantas opções mostra a caixa de busca interna. */
  searchThreshold?: number
  /** Outras chaves de URL a remover quando este filtro muda (ex.: banca limpa especialidade). */
  clearKeys?: string[]
}

function parseList(v: string | null): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

type Coords = {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

export function FilterDropdown({
  label,
  urlKey,
  basePath,
  options,
  single = false,
  colored = false,
  searchThreshold = 8,
  clearKeys,
}: FilterDropdownProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [query, setQuery] = useState('')
  const [coords, setCoords] = useState<Coords | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  const selected = single
    ? parseList(searchParams.get(urlKey)).slice(0, 1)
    : parseList(searchParams.get(urlKey))

  // Calcula a posição do painel a partir do botão; decide abrir p/ cima ou baixo.
  const updatePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 8
    const gap = 6
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow
    const maxHeight = Math.min(300, Math.max(140, (openUp ? spaceAbove : spaceBelow) - gap))
    setCoords({
      left: rect.left,
      width: rect.width,
      maxHeight,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    })
  }, [])

  useLayoutEffect(() => {
    if (open) updatePosition()
  }, [open, updatePosition])

  // Reposiciona ao rolar/redimensionar; fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!open) return
    function onReposition() {
      updatePosition()
    }
    function onPointer(e: MouseEvent) {
      const t = e.target as Node
      if (
        triggerRef.current?.contains(t) ||
        panelRef.current?.contains(t)
      )
        return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, updatePosition])

  const pushParams = useCallback(
    (next: string[]) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next.length > 0) params.set(urlKey, next.join(','))
      else params.delete(urlKey)
      if (clearKeys) for (const k of clearKeys) params.delete(k)
      params.delete('page')
      const qs = params.toString()
      router.push(`${basePath}${qs ? '?' + qs : ''}`, { scroll: false })
    },
    [router, searchParams, urlKey, basePath, clearKeys]
  )

  const toggle = useCallback(
    (slug: string) => {
      if (single) {
        pushParams(selected[0] === slug ? [] : [slug])
        setOpen(false)
        return
      }
      const next = selected.includes(slug)
        ? selected.filter((s) => s !== slug)
        : [...selected, slug]
      pushParams(next)
    },
    [pushParams, selected, single]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  const count = selected.length
  const showSearch = options.length > searchThreshold

  function handleToggleOpen() {
    setOpen((v) => {
      if (v) return false
      setQuery('')
      return true
    })
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggleOpen}
        aria-expanded={open}
        className={cn(
          'inline-flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-[12px] transition-colors',
          count > 0
            ? 'border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)] text-[var(--mm-gold)]'
            : 'border-[var(--mm-border-default)] text-[var(--mm-text2)] hover:border-[var(--mm-border-hover)]'
        )}
      >
        <span className="flex items-center gap-1.5 truncate">
          <span className="truncate">{label}</span>
          {count > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--mm-gold)] px-1 text-[10px] font-bold text-[#0A0A0A]">
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn('size-3.5 flex-shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {mounted &&
        open &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              left: coords.left,
              width: Math.max(coords.width, 220),
              ...(coords.top !== undefined ? { top: coords.top } : {}),
              ...(coords.bottom !== undefined ? { bottom: coords.bottom } : {}),
            }}
            className="z-[100] overflow-hidden rounded-lg border border-[var(--mm-border-default)] bg-[var(--mm-surface)] shadow-2xl"
          >
            {showSearch && (
              <div className="flex items-center gap-2 border-b border-[var(--mm-border-default)] px-2.5 py-2">
                <Search className="size-3.5 flex-shrink-0 text-[var(--mm-muted)]" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full bg-transparent text-[12px] text-[var(--mm-text2)] outline-none placeholder:text-[var(--mm-muted)]"
                />
              </div>
            )}

            <div className="overflow-y-auto py-1" style={{ maxHeight: coords.maxHeight }}>
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    pushParams([])
                    if (single) setOpen(false)
                  }}
                  className="flex w-full items-center px-2.5 py-1.5 text-left text-[11px] text-[var(--mm-muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--mm-text2)]"
                >
                  Limpar seleção
                </button>
              )}

              {filtered.length === 0 ? (
                <div className="px-2.5 py-3 text-center text-[11px] text-[var(--mm-muted)]">
                  Nenhuma opção
                </div>
              ) : (
                filtered.map((o) => {
                  const active = selected.includes(o.slug)
                  return (
                    <button
                      key={o.slug}
                      type="button"
                      onClick={() => toggle(o.slug)}
                      className={cn(
                        'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.04]',
                        active ? 'text-[var(--mm-gold)]' : 'text-[var(--mm-text2)]'
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-4 flex-shrink-0 items-center justify-center border',
                          single ? 'rounded-full' : 'rounded',
                          active
                            ? 'border-[var(--mm-gold)] bg-[var(--mm-gold-bg)]'
                            : 'border-[var(--mm-border-default)]'
                        )}
                      >
                        {active && <Check className="size-3 text-[var(--mm-gold)]" />}
                      </span>
                      {colored && (
                        <span
                          className="inline-block size-2 flex-shrink-0 rounded-sm"
                          style={{ background: o.color ?? '#5A6880' }}
                        />
                      )}
                      <span className="truncate">{o.label}</span>
                    </button>
                  )
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
