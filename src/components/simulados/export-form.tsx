'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export type ExportFormat = 'pdf' | 'docx' | 'xlsx'

export type ContentFlags = {
  enunciado: boolean
  alternativas: boolean
  figuras: boolean
  gabarito: boolean
  coment_alt: boolean
  coment_compilado: boolean
  taxonomia: boolean
  referencias: boolean
}

const FORMATS: Array<{ value: ExportFormat; label: string; description: string }> = [
  { value: 'pdf', label: 'PDF', description: 'Caderno de questões comentadas' },
  { value: 'docx', label: 'DOCX', description: 'Documento editável' },
  { value: 'xlsx', label: 'XLSX', description: 'Planilha analítica' },
]

const CONTENT_FIELDS: Array<{ key: keyof ContentFlags; label: string }> = [
  { key: 'enunciado', label: 'Enunciado' },
  { key: 'alternativas', label: 'Alternativas' },
  { key: 'figuras', label: 'Figuras / imagens' },
  { key: 'gabarito', label: 'Gabarito' },
  { key: 'coment_alt', label: 'Comentário por alternativa' },
  { key: 'coment_compilado', label: 'Comentário compilado' },
  { key: 'taxonomia', label: 'Classificação curricular' },
  { key: 'referencias', label: 'Referências bibliográficas' },
]

type Props = {
  simuladoId: string
  filtersSummary?: string | null
  totalQuestions?: number
}

export function ExportForm({ simuladoId, filtersSummary, totalQuestions = 0 }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [content, setContent] = useState<ContentFlags>({
    enunciado: true,
    alternativas: true,
    figuras: true,
    gabarito: true,
    coment_alt: true,
    coment_compilado: true,
    taxonomia: false,
    referencias: false,
  })

  const noQuestions = totalQuestions === 0
  const noContentSelected = !Object.values(content).some(Boolean)
  const blocked = pending || noQuestions || noContentSelected

  function toggle(key: keyof ContentFlags) {
    setContent((c) => ({ ...c, [key]: !c[key] }))
  }

  async function handleExport() {
    setError(null)
    if (noQuestions) {
      setError('Nenhuma questão para exportar.')
      return
    }
    if (noContentSelected) {
      setError('Selecione pelo menos um campo em "Conteúdo a incluir".')
      return
    }

    const params = new URLSearchParams({ format })
    for (const [k, v] of Object.entries(content)) {
      params.set(k, v ? '1' : '0')
    }

    start(async () => {
      try {
        const res = await fetch(`/api/simulados/${simuladoId}/export?${params.toString()}`, {
          method: 'GET',
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          let message = text || `Falha na exportação (${res.status})`
          try {
            const parsed = JSON.parse(text)
            if (parsed?.error) message = parsed.error
          } catch {
            // texto livre
          }
          throw new Error(message)
        }

        const cd = res.headers.get('content-disposition') ?? ''
        const match = cd.match(/filename="([^"]+)"/)
        const filename = match?.[1] ?? `simulado.${format}`
        const blob = await res.blob()

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 0)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao exportar')
      }
    })
  }

  const selectedFormat = FORMATS.find((f) => f.value === format)!

  return (
    <div className="flex flex-col gap-6">
      {/* Cards lado a lado */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Formato */}
        <section className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-5 flex flex-col gap-3">
          <h2 className="font-[family-name:var(--font-syne)] text-base font-semibold text-foreground">
            Formato de exportação
          </h2>
          <div className="flex flex-col gap-2">
            {FORMATS.map((f) => {
              const active = format === f.value
              return (
                <label
                  key={f.value}
                  className={`flex items-center gap-3 cursor-pointer rounded-lg border px-3.5 py-3 transition-all ${
                    active
                      ? 'border-[var(--mm-gold)]/50 bg-[var(--mm-gold)]/5 ring-1 ring-[var(--mm-gold)]/30'
                      : 'border-white/7 bg-white/[0.02] hover:bg-white/5'
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value={f.value}
                    checked={active}
                    onChange={() => setFormat(f.value)}
                    className="sr-only"
                  />
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
                      active
                        ? 'border-[var(--mm-gold)]'
                        : 'border-white/20'
                    }`}
                  >
                    {active && (
                      <span className="h-2 w-2 rounded-full bg-[var(--mm-gold)]" />
                    )}
                  </span>
                  <span className="text-sm text-foreground">
                    <span className="font-semibold">{f.label}</span>
                    <span className="text-muted-foreground"> — {f.description}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </section>

        {/* Conteúdo */}
        <section className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-5 flex flex-col gap-3">
          <h2 className="font-[family-name:var(--font-syne)] text-base font-semibold text-foreground">
            Conteúdo a incluir
          </h2>
          <div className="grid grid-cols-1 gap-2">
            {CONTENT_FIELDS.map((c) => {
              const active = content[c.key]
              const disabled = format === 'xlsx' && c.key === 'figuras'
              return (
                <label
                  key={c.key}
                  className={`flex items-center gap-3 cursor-pointer rounded-md px-2 py-1.5 transition-colors ${
                    disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-white/3'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active && !disabled}
                    disabled={disabled}
                    onChange={() => toggle(c.key)}
                    className="sr-only"
                  />
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded border transition-all ${
                      active && !disabled
                        ? 'border-[var(--mm-gold)] bg-[var(--mm-gold)]'
                        : 'border-white/20 bg-transparent'
                    }`}
                  >
                    {active && !disabled && (
                      <svg
                        viewBox="0 0 12 12"
                        className="h-3 w-3 text-[#0a0a0a]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2.5 6.2L5 8.8 9.5 3.6" />
                      </svg>
                    )}
                  </span>
                  <span className="text-sm text-foreground">{c.label}</span>
                </label>
              )
            })}
          </div>
        </section>
      </div>

      {/* Preview */}
      <section className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-5 flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-syne)] text-base font-semibold text-foreground">
          Preview do documento
        </h2>
        <div className="rounded-lg border border-white/5 bg-white/[0.015] p-6 flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 pb-3 border-b border-white/7">
            <p className="font-[family-name:var(--font-syne)] text-base font-semibold text-foreground">
              Banco de Questões TEMI
            </p>
            <p className="text-xs text-muted-foreground">
              {filtersSummary ?? 'Simulado MedMaestro'}
            </p>
            <span className="mt-1 inline-block h-px w-12 bg-[var(--mm-gold)]/60" />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-[var(--mm-gold)]">
              Questão 1 (TEMI 2024 · Q08)
            </p>
            {content.enunciado && (
              <p className="text-sm text-foreground">
                Paciente sob ventilação pulmonar artificial invasiva, que evoluiu com SDRA…
              </p>
            )}
            {content.alternativas && (
              <p className="text-xs text-muted-foreground">
                A) ... &nbsp; B) ... &nbsp; C) ... &nbsp; D) ... &nbsp; E) ...
              </p>
            )}
            {content.figuras && (
              <p className="text-[11px] text-muted-foreground italic">
                [figura associada será embarcada quando disponível]
              </p>
            )}
            {content.gabarito && (
              <div className="rounded border-l-2 border-[var(--mm-green)] bg-[var(--mm-green)]/8 px-3 py-2 text-sm">
                <span className="font-semibold text-[var(--mm-green)]">Gabarito: A</span>
                <span className="text-muted-foreground">
                  {' '}— A curva P-V mostra progressiva perda de complacência…
                </span>
              </div>
            )}
            {content.coment_alt && (
              <p className="text-[11px] text-muted-foreground">
                ✓ Comentário por alternativa (A/B/C/D/E)
              </p>
            )}
            {content.coment_compilado && (
              <p className="text-[11px] text-muted-foreground">
                ✓ Comentário compilado da banca
              </p>
            )}
            {content.taxonomia && (
              <p className="text-[11px] text-muted-foreground">
                ✓ Tags de classificação curricular
              </p>
            )}
            {content.referencias && (
              <p className="text-[11px] text-muted-foreground">
                ✓ Referências bibliográficas
              </p>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-[var(--mm-red)]/30 bg-[var(--mm-red)]/8 p-3 text-sm text-[var(--mm-red)]">
          {error}
        </div>
      )}

      {/* Ações */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleExport}
          disabled={blocked}
          aria-disabled={blocked}
          className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-gradient-to-br from-[var(--mm-gold)] to-[var(--mm-gold2)] text-[#0a0a0a] text-sm font-semibold shadow-[0_8px_24px_-8px_rgba(212,168,67,0.45)] hover:brightness-105 active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        >
          {pending ? (
            <>
              <svg
                viewBox="0 0 16 16"
                width={14}
                height={14}
                className="animate-spin"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" />
              </svg>
              Gerando {format.toUpperCase()}…
            </>
          ) : (
            <>
              Exportar agora
              <span aria-hidden>→</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/simulados/${simuladoId}`)}
          className="inline-flex items-center h-10 px-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-foreground transition-colors"
        >
          Voltar aos filtros
        </button>
        {noQuestions && (
          <p className="text-xs text-[var(--mm-muted)]">
            Adicione questões ao simulado antes de exportar.
          </p>
        )}
        {!noQuestions && noContentSelected && (
          <p className="text-xs text-[var(--mm-muted)]">
            Selecione ao menos um campo em &quot;Conteúdo a incluir&quot;.
          </p>
        )}
      </div>
    </div>
  )
}
