'use client'

import { useState, useTransition } from 'react'
import { Download, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'

type Format = 'pptx' | 'docx' | 'pdf'

type Props = {
  /** Filtros ativos do banco (mesmas chaves de sample_questions). */
  filters: Record<string, string>
  /** Total de questões no pool filtrado (máximo selecionável). */
  poolCount: number
}

const FORMAT_LABELS: { value: Format; label: string; hint: string }[] = [
  { value: 'pptx', label: 'PPTX', hint: 'Slides de aula' },
  { value: 'docx', label: 'Word', hint: 'Documento editável' },
  { value: 'pdf', label: 'PDF', hint: 'Caderno pronto' },
]

export function ExportProfessoresButton({ filters, poolCount }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [format, setFormat] = useState<Format>('pptx')
  const [withDicas, setWithDicas] = useState(true)
  const [qty, setQty] = useState(Math.min(15, poolCount) || 1)

  const clampedQty = Math.max(1, Math.min(qty || 1, poolCount))
  const blocked = pending || poolCount === 0

  async function runExport() {
    setError(null)
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v)
    }
    params.set('format', format)
    params.set('total', String(clampedQty))
    // Conteúdo voltado ao professor: questão completa + gabarito + comentário + dicas.
    params.set('enunciado', '1')
    params.set('alternativas', '1')
    params.set('figuras', '1')
    params.set('gabarito', '1')
    params.set('coment_compilado', '1')
    params.set('dica_professor', withDicas ? '1' : '0')
    params.set('title', 'Banco de Questões TEMI — material do professor')

    const res = await fetch(`/api/export?${params.toString()}`, { method: 'GET' })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let message = text || `Falha na exportação (${res.status})`
      try {
        const parsed = JSON.parse(text)
        if (parsed?.error) message = parsed.error
      } catch {
        /* texto livre */
      }
      throw new Error(message)
    }

    const cd = res.headers.get('content-disposition') ?? ''
    const match = cd.match(/filename="([^"]+)"/)
    const filename = match?.[1] ?? `questoes.${format}`
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function handleClick() {
    if (!open) {
      setOpen(true)
      return
    }
    start(async () => {
      try {
        await runExport()
        setOpen(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao exportar')
      }
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={blocked}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-semibold transition-all',
          blocked
            ? 'cursor-not-allowed border-[var(--mm-border-default)] text-[var(--mm-muted)]'
            : 'border-[var(--mm-border-active)] text-[var(--mm-gold)] hover:bg-[var(--mm-gold-bg)]'
        )}
      >
        <GraduationCap className="size-3.5" />
        {open ? (pending ? 'Gerando…' : `Baixar ${format.toUpperCase()}`) : 'Exportar p/ professores'}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-[var(--mm-border-default)] bg-[var(--mm-card-bg)] p-4 shadow-xl backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--mm-muted)]">
            Exportar para professores
          </p>

          {/* Quantidade */}
          <label className="mb-1 block text-[11px] text-[var(--mm-muted)]">
            Quantidade (máx. {poolCount})
          </label>
          <div className="mb-3 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={poolCount}
              value={qty}
              onChange={(e) => setQty(parseInt(e.target.value, 10) || 0)}
              className="h-8 w-20 rounded-md border border-[var(--mm-border-default)] bg-[rgba(14,40,65,0.04)] px-2 text-sm text-foreground outline-none focus:border-[var(--mm-border-active)]"
            />
            <input
              type="range"
              min={1}
              max={poolCount}
              value={clampedQty}
              onChange={(e) => setQty(parseInt(e.target.value, 10))}
              className="flex-1 accent-[var(--mm-gold)]"
            />
          </div>

          {/* Formato */}
          <div className="mb-3 grid grid-cols-3 gap-1.5">
            {FORMAT_LABELS.map((f) => {
              const active = format === f.value
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFormat(f.value)}
                  className={cn(
                    'flex flex-col items-center rounded-md border px-2 py-1.5 text-[11px] transition-colors',
                    active
                      ? 'border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)] text-[var(--mm-gold)]'
                      : 'border-[var(--mm-border-default)] text-foreground hover:border-[var(--mm-border-hover)]'
                  )}
                >
                  <span className="font-semibold">{f.label}</span>
                  <span className="text-[10px] text-[var(--mm-muted)]">{f.hint}</span>
                </button>
              )
            })}
          </div>

          {/* Dicas */}
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={withDicas}
              onChange={(e) => setWithDicas(e.target.checked)}
              className="accent-[var(--mm-gold)]"
            />
            Incluir dica para o professor (IA)
          </label>

          {withDicas && (
            <p className="mb-2 text-[10px] leading-snug text-[var(--mm-muted)]">
              Gera dicas pedagógicas na 1ª vez e salva para reuso. Pode levar alguns segundos por
              questão.
            </p>
          )}

          {error && <p className="mb-2 text-[11px] text-[var(--mm-red)]">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClick}
              disabled={pending}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-bold text-[#FFFFFF] transition-all',
                pending ? 'opacity-60' : 'hover:-translate-y-px'
              )}
              style={{
                background: 'linear-gradient(135deg, var(--mm-gold) 0%, var(--mm-gold2) 100%)',
              }}
            >
              {pending ? 'Gerando…' : (
                <span className="inline-flex items-center gap-1">
                  <Download className="size-3" /> Baixar {format.toUpperCase()}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setError(null)
              }}
              className="rounded-md border border-[var(--mm-border-default)] px-3 py-1.5 text-xs text-[var(--mm-muted)] hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
