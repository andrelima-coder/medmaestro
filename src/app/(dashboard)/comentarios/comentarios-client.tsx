'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { generateCommentsBatchAction, type CommentRow } from './actions'
import { Card, CardBody, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

const COST_PER_COMMENT_USD = 0.015

export function ComentariosClient({
  rows,
  exams,
  initialFilter,
}: {
  rows: CommentRow[]
  exams: { id: string; label: string }[]
  initialFilter: { examId: string; onlyPending: boolean; lowConf: boolean }
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  const allSelected = rows.length > 0 && selected.size === rows.length
  const totalSel = selected.size
  const estCost = (totalSel * COST_PER_COMMENT_USD).toFixed(2)

  const filterUrl = useMemo(
    () => (next: Partial<typeof initialFilter>) => {
      const f = { ...initialFilter, ...next }
      const params = new URLSearchParams()
      if (f.examId) params.set('exam', f.examId)
      if (f.onlyPending) params.set('only_pending', '1')
      if (f.lowConf) params.set('low_conf', '1')
      return `/comentarios${params.toString() ? `?${params.toString()}` : ''}`
    },
    [initialFilter]
  )

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function dispatch() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setFeedback(null)
    startTransition(async () => {
      const res = await generateCommentsBatchAction(ids)
      if (res.ok) {
        setFeedback(
          `${res.queued} comentários enfileirados — eles aparecem em segundos. Atualize esta página para ver o status.`
        )
        setSelected(new Set())
        setTimeout(() => router.refresh(), 8000)
      } else {
        setFeedback(`Erro: ${res.error}`)
      }
    })
  }

  const canGenerate = totalSel > 0 && !pending

  return (
    <div className="flex flex-col gap-4">
      {/* AI banner purple */}
      <div className="flex items-center gap-3 rounded-[10px] border border-[rgba(139,92,246,0.20)] bg-[rgba(139,92,246,0.08)] px-4 py-3">
        <div
          className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg"
          style={{
            background: 'linear-gradient(135deg, #7B3FCE, var(--mm-gold))',
          }}
        >
          <Sparkles className="size-4 text-white" />
        </div>
        <div className="flex-1">
          <div className="text-xs font-semibold text-[#A78BFA]">
            Geração por IA · Claude Sonnet
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--mm-muted)]">
            Selecione questões e dispare a geração em lote. Comentários gerados podem ser
            editados na questão correspondente.
          </div>
        </div>
        <Badge tone="purple">{rows.length} disponíveis</Badge>
      </div>

      {/* Filtros */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <select
            value={initialFilter.examId}
            onChange={(e) => router.push(filterUrl({ examId: e.target.value }))}
            className="min-w-[220px] rounded-lg border border-[var(--mm-border-default)] bg-white/[0.04] px-3 py-1.5 text-xs text-foreground outline-none transition-colors hover:border-[var(--mm-border-hover)] focus:border-[var(--mm-border-active)]"
          >
            <option value="">Todos os exames</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>

          <CheckboxLabel
            checked={initialFilter.onlyPending}
            onChange={(checked) => router.push(filterUrl({ onlyPending: checked }))}
          >
            Apenas sem comentário
          </CheckboxLabel>

          <CheckboxLabel
            checked={initialFilter.lowConf}
            onChange={(checked) => router.push(filterUrl({ lowConf: checked }))}
          >
            Apenas baixa confiança (≤2)
          </CheckboxLabel>

          <span className="ml-auto text-[11px] text-[var(--mm-muted)]">
            {rows.length} questões filtradas
          </span>
        </CardBody>
      </Card>

      {/* Barra de ação */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3 py-3">
          <span className="text-xs text-[var(--mm-text2)]">
            {totalSel} selecionada{totalSel === 1 ? '' : 's'}
            {totalSel > 0 && (
              <span className="text-[var(--mm-muted)]">
                {' · '}≈ ${estCost} ({COST_PER_COMMENT_USD}/Q)
              </span>
            )}
          </span>
          <button
            onClick={dispatch}
            disabled={!canGenerate}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-[family-name:var(--font-syne)] text-xs font-bold transition-all',
              canGenerate
                ? 'text-[#0A0A0A] hover:-translate-y-px'
                : 'cursor-not-allowed border border-[var(--mm-border-default)] bg-transparent text-[var(--mm-muted)]'
            )}
            style={
              canGenerate
                ? {
                    background:
                      'linear-gradient(135deg, var(--mm-gold) 0%, var(--mm-orange) 100%)',
                    boxShadow:
                      '0 4px 20px rgba(201,120,30,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                  }
                : undefined
            }
          >
            <Sparkles className="size-3.5" />
            {pending ? 'Enfileirando…' : `Gerar comentários (${totalSel})`}
          </button>

          {feedback && (
            <span
              className={cn(
                'ml-2 text-[11px]',
                feedback.startsWith('Erro') ? 'text-[var(--mm-red)]' : 'text-[var(--mm-green)]'
              )}
            >
              {feedback}
            </span>
          )}
        </CardBody>
      </Card>

      {/* Tabela */}
      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-[var(--mm-muted)]">
              Nenhuma questão encontrada com esses filtros.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </Th>
                  <Th>EXAME</Th>
                  <Th>Q#</Th>
                  <Th>ENUNCIADO</Th>
                  <Th>CONF.</Th>
                  <Th>COMENTÁRIO</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b border-[var(--mm-border-default)] transition-colors hover:bg-white/[0.02]"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('input,a')) return
                      window.location.href = `/questoes/${r.id}`
                    }}
                  >
                    <Td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                      />
                    </Td>
                    <Td className="text-[var(--mm-muted)]">{r.exam_label}</Td>
                    <td className="p-0">
                      <Link
                        href={`/questoes/${r.id}`}
                        className="block px-4 py-3 text-xs font-bold text-[var(--mm-gold)] no-underline"
                      >
                        Q{r.question_number}
                      </Link>
                    </td>
                    <Td className="max-w-[360px] truncate">{r.stem || '—'}</Td>
                    <Td className="text-[var(--mm-text2)]">
                      {r.extraction_confidence != null
                        ? `${r.extraction_confidence}/5`
                        : '—'}
                    </Td>
                    <Td>
                      {r.has_comment ? (
                        <Badge tone="green">✓ Tem</Badge>
                      ) : (
                        <Badge tone="muted">—</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b border-[var(--mm-line2)] px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--mm-muted)]"
    >
      {children}
    </th>
  )
}

function Td({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: (e: React.MouseEvent) => void
}) {
  return (
    <td
      className={cn('px-4 py-3 text-xs text-foreground', className)}
      onClick={onClick}
    >
      {children}
    </td>
  )
}

function CheckboxLabel({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--mm-text2)] transition-colors hover:text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--mm-gold)]"
      />
      {children}
    </label>
  )
}
