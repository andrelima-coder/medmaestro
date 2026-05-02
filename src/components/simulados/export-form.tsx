'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download } from 'lucide-react'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui'
import { cn } from '@/lib/utils'

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

const FORMATS: Array<{
  value: ExportFormat
  label: string
  description: string
  iconLetter: string
  iconColor: string
  iconBg: string
  iconBorder: string
}> = [
  {
    value: 'pdf',
    label: 'PDF',
    description: 'Caderno de questões comentadas',
    iconLetter: 'P',
    iconColor: '#EF5350',
    iconBg: 'rgba(239,83,80,0.15)',
    iconBorder: 'rgba(239,83,80,0.4)',
  },
  {
    value: 'docx',
    label: 'DOCX',
    description: 'Documento editável',
    iconLetter: 'W',
    iconColor: '#5B9BF5',
    iconBg: 'rgba(41,95,178,0.30)',
    iconBorder: 'rgba(41,95,178,0.5)',
  },
  {
    value: 'xlsx',
    label: 'XLSX',
    description: 'Planilha analítica',
    iconLetter: 'X',
    iconColor: '#4ADE80',
    iconBg: 'rgba(21,128,61,0.25)',
    iconBorder: 'rgba(21,128,61,0.4)',
  },
]

const CONTENT_FIELDS: Array<{ key: keyof ContentFlags; label: string; emphasis?: boolean }> = [
  { key: 'enunciado', label: 'Enunciado' },
  { key: 'alternativas', label: 'Alternativas' },
  { key: 'figuras', label: 'Figuras / imagens' },
  { key: 'gabarito', label: 'Gabarito' },
  { key: 'coment_alt', label: 'Comentário por alternativa', emphasis: true },
  { key: 'coment_compilado', label: 'Comentário compilado', emphasis: true },
  { key: 'taxonomia', label: 'Classificação curricular' },
  { key: 'referencias', label: 'Referências bibliográficas' },
]

type Props = {
  simuladoId: string
  filtersSummary?: string | null
  previewSubtitle?: string | null
  totalQuestions?: number
}

export function ExportForm({
  simuladoId,
  filtersSummary,
  previewSubtitle,
  totalQuestions = 0,
}: Props) {
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

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Formato */}
        <Card glow="gold">
          <CardHeader>
            <CardTitle>Formato de exportação</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-2.5">
            {FORMATS.map((f) => {
              const active = format === f.value
              return (
                <label
                  key={f.value}
                  className={cn(
                    'flex cursor-pointer items-center gap-3.5 rounded-[10px] border p-3.5 transition-all',
                    active
                      ? 'border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)]'
                      : 'border-[var(--mm-border-default)] hover:border-[var(--mm-border-hover)]'
                  )}
                  style={
                    active
                      ? { borderWidth: 2, padding: 13 } // mockup: border-2 quando ativo
                      : undefined
                  }
                >
                  <input
                    type="radio"
                    name="format"
                    value={f.value}
                    checked={active}
                    onChange={() => setFormat(f.value)}
                    className="sr-only"
                  />
                  <div
                    className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg border font-[family-name:var(--font-syne)] text-[10px] font-extrabold"
                    style={{
                      background: f.iconBg,
                      borderColor: f.iconBorder,
                      color: f.iconColor,
                    }}
                  >
                    {f.iconLetter}
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-foreground">
                      {f.label} (.{f.value})
                    </div>
                    <div className="text-[11px] text-[var(--mm-muted)]">
                      {f.description}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'inline-flex size-4 items-center justify-center rounded-full border',
                      active
                        ? 'border-[var(--mm-gold)]'
                        : 'border-white/20'
                    )}
                  >
                    {active && (
                      <span className="size-2 rounded-full bg-[var(--mm-gold)]" />
                    )}
                  </span>
                </label>
              )
            })}
          </CardBody>
        </Card>

        {/* Conteúdo */}
        <Card>
          <CardHeader>
            <CardTitle>Conteúdo a incluir</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-2">
            {CONTENT_FIELDS.map((c) => {
              const active = content[c.key]
              const disabled = format === 'xlsx' && c.key === 'figuras'
              return (
                <label
                  key={c.key}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
                    disabled
                      ? 'cursor-not-allowed opacity-40 border-[var(--mm-border-default)]'
                      : 'cursor-pointer hover:border-[var(--mm-border-hover)]',
                    !disabled && c.emphasis && active
                      ? 'border-[rgba(201,168,76,0.20)] bg-[rgba(201,168,76,0.03)]'
                      : 'border-[var(--mm-border-default)]'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={active && !disabled}
                    disabled={disabled}
                    onChange={() => toggle(c.key)}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      'inline-flex size-4 flex-shrink-0 items-center justify-center rounded border transition-all',
                      active && !disabled
                        ? 'border-[var(--mm-gold)] bg-[var(--mm-gold)]'
                        : 'border-white/20 bg-transparent'
                    )}
                  >
                    {active && !disabled && (
                      <svg
                        viewBox="0 0 12 12"
                        className="size-3 text-[#0a0a0a]"
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
                  <span className="text-[13px] text-foreground">{c.label}</span>
                </label>
              )
            })}
          </CardBody>
        </Card>
      </div>

      {/* Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Preview do documento</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="rounded-lg border border-[var(--mm-border-default)] bg-white/[0.015] p-6">
            <div className="mb-3 flex flex-col items-center gap-1 border-b border-[var(--mm-border-default)] pb-3">
              <p className="font-[family-name:var(--font-syne)] text-base font-semibold text-foreground">
                Banco de Questões TEMI
              </p>
              <p className="text-xs text-[var(--mm-muted)]">
                {previewSubtitle ?? filtersSummary ?? 'Simulado MedMaestro'}
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
                <p className="text-xs text-[var(--mm-muted)]">
                  A) ... &nbsp; B) ... &nbsp; C) ... &nbsp; D) ... &nbsp; E) ...
                </p>
              )}
              {content.figuras && (
                <p className="text-[11px] italic text-[var(--mm-muted)]">
                  [figura associada será embarcada quando disponível]
                </p>
              )}
              {content.gabarito && (
                <div className="rounded border-l-2 border-[var(--mm-green)] bg-[rgba(102,187,106,0.08)] px-3 py-2 text-sm">
                  <span className="font-semibold text-[var(--mm-green)]">Gabarito: A</span>
                  <span className="text-[var(--mm-muted)]">
                    {' '}— A curva P-V mostra progressiva perda de complacência…
                  </span>
                </div>
              )}
              {content.coment_alt && (
                <p className="text-[11px] text-[var(--mm-muted)]">
                  ✓ Comentário por alternativa (A/B/C/D/E)
                </p>
              )}
              {content.coment_compilado && (
                <p className="text-[11px] text-[var(--mm-muted)]">
                  ✓ Comentário compilado da banca
                </p>
              )}
              {content.taxonomia && (
                <p className="text-[11px] text-[var(--mm-muted)]">
                  ✓ Tags de classificação curricular
                </p>
              )}
              {content.referencias && (
                <p className="text-[11px] text-[var(--mm-muted)]">
                  ✓ Referências bibliográficas
                </p>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-lg border border-[rgba(239,83,80,0.30)] bg-[rgba(239,83,80,0.08)] p-3 text-sm text-[var(--mm-red)]">
          {error}
        </div>
      )}

      {/* Stepper de paginação (Tela 7 de 8) */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-3 rounded-full border border-[var(--mm-border-default)] bg-[var(--mm-card-bg)] px-4 py-1.5 backdrop-blur-md">
          <span className="text-xs text-[var(--mm-muted)]">
            Tela <span className="font-semibold text-foreground">7</span> de 8
          </span>
          <Link
            href="/questoes"
            className="inline-flex h-8 items-center rounded-full border border-[var(--mm-border-default)] bg-white/[0.04] px-3 text-xs text-foreground transition-colors hover:border-[var(--mm-border-hover)]"
          >
            ← Anterior
          </Link>
          <Link
            href="/auditoria"
            className="inline-flex h-8 items-center rounded-full px-3.5 text-xs font-semibold text-[#0A0A0A] transition-all hover:-translate-y-px"
            style={{
              background:
                'linear-gradient(135deg, var(--mm-gold) 0%, var(--mm-orange) 100%)',
              boxShadow:
                '0 4px 20px rgba(201,120,30,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            Próxima →
          </Link>
        </div>
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={blocked}
          aria-disabled={blocked}
          className={cn(
            'inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-semibold transition-all',
            blocked
              ? 'cursor-not-allowed border border-[var(--mm-border-default)] bg-transparent text-[var(--mm-muted)]'
              : 'text-[#0A0A0A] hover:-translate-y-px active:translate-y-px'
          )}
          style={
            !blocked
              ? {
                  background:
                    'linear-gradient(135deg, var(--mm-gold) 0%, var(--mm-orange) 100%)',
                  boxShadow:
                    '0 4px 20px rgba(201,120,30,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                }
              : undefined
          }
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
              <Download className="size-3.5" />
              Exportar {totalQuestions > 0 ? `${totalQuestions} questões` : 'agora'} (.{format})
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/simulados/${simuladoId}`)}
          className="inline-flex h-10 items-center rounded-lg border border-[var(--mm-border-default)] bg-transparent px-4 text-sm text-[var(--mm-text2)] transition-colors hover:border-[var(--mm-border-hover)] hover:text-foreground"
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
