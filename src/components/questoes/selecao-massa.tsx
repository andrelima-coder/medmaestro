'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import {
  addQuestionsToSimuladoBulkAction,
  listFilteredQuestionIdsAction,
  listSimuladosParaAdicionarAction,
  type SimuladoOption,
} from '@/app/(dashboard)/questoes/selecao-actions'

// Seleção em massa do Banco de Questões → adicionar ao simulado (caderno).

type Ctx = {
  selected: Set<string>
  toggle: (id: string) => void
  setMany: (ids: string[], on: boolean) => void
  clear: () => void
}

const SelecaoContext = createContext<Ctx | null>(null)

export function SelecaoProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const ctx = useMemo<Ctx>(
    () => ({
      selected,
      toggle: (id) =>
        setSelected((s) => {
          const n = new Set(s)
          if (n.has(id)) n.delete(id)
          else n.add(id)
          return n
        }),
      setMany: (ids, on) =>
        setSelected((s) => {
          const n = new Set(s)
          for (const id of ids) {
            if (on) n.add(id)
            else n.delete(id)
          }
          return n
        }),
      clear: () => setSelected(new Set()),
    }),
    [selected]
  )

  return <SelecaoContext.Provider value={ctx}>{children}</SelecaoContext.Provider>
}

export function SelecaoCheckbox({ id }: { id: string }) {
  const ctx = useContext(SelecaoContext)
  if (!ctx) return null
  return (
    <input
      type="checkbox"
      aria-label="Selecionar questão"
      checked={ctx.selected.has(id)}
      onChange={() => ctx.toggle(id)}
      className="size-4 shrink-0 accent-[var(--mm-gold)]"
    />
  )
}

export function SelecaoBar({
  pageIds,
  filters,
  total,
}: {
  pageIds: string[]
  filters: Record<string, string>
  total: number
}) {
  const ctx = useContext(SelecaoContext)
  const [isPending, startTransition] = useTransition()
  const [simulados, setSimulados] = useState<SimuladoOption[] | null>(null)
  const [destino, setDestino] = useState<string>('novo')
  const [novoTitulo, setNovoTitulo] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string; simuladoId?: string } | null>(null)

  const count = ctx?.selected.size ?? 0

  // Carrega os simulados de destino quando a barra aparece pela primeira vez.
  useEffect(() => {
    if (count > 0 && simulados === null) {
      listSimuladosParaAdicionarAction().then(setSimulados)
    }
  }, [count, simulados])

  if (!ctx) return null

  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => ctx.selected.has(id))

  function selectAllFiltered() {
    setMsg(null)
    startTransition(async () => {
      const res = await listFilteredQuestionIdsAction(filters)
      if (!res.ok) {
        setMsg({ ok: false, text: res.error ?? 'Falha ao selecionar.' })
        return
      }
      ctx!.setMany(res.ids, true)
    })
  }

  function addToSimulado() {
    setMsg(null)
    startTransition(async () => {
      const res = await addQuestionsToSimuladoBulkAction({
        simuladoId: destino === 'novo' ? null : destino,
        newTitle: destino === 'novo' ? novoTitulo : null,
        questionIds: [...ctx!.selected],
      })
      if (!res.ok) {
        setMsg({ ok: false, text: res.error })
        return
      }
      ctx!.clear()
      setSimulados(null) // recarrega contagens na próxima seleção
      setMsg({
        ok: true,
        simuladoId: res.simuladoId,
        text: `${res.added === 1 ? '1 questão adicionada' : `${res.added} questões adicionadas`}${
          res.skipped > 0
            ? ` (${res.skipped === 1 ? '1 já estava' : `${res.skipped} já estavam`} no simulado)`
            : ''
        }.`,
      })
    })
  }

  return (
    <div className="rounded-xl border border-[var(--mm-border-default)] bg-card p-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2 font-medium text-foreground">
          <input
            type="checkbox"
            checked={allPageSelected}
            onChange={(e) => ctx.setMany(pageIds, e.target.checked)}
            className="size-4 accent-[var(--mm-gold)]"
          />
          Selecionar página
        </label>
        <button
          type="button"
          onClick={selectAllFiltered}
          disabled={isPending || total === 0}
          className="font-semibold text-[var(--mm-gold)] hover:underline disabled:opacity-50"
        >
          Selecionar todas as {total.toLocaleString('pt-BR')} filtradas
        </button>
        {count > 0 && (
          <>
            <span className="text-[var(--mm-muted)]">
              {count.toLocaleString('pt-BR')} selecionada{count > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => ctx.clear()}
              className="text-[var(--mm-muted)] hover:text-foreground hover:underline"
            >
              Limpar
            </button>
          </>
        )}
      </div>

      {count > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="rounded-lg border border-[var(--mm-border-default)] bg-background px-2 py-1.5 text-xs"
          >
            <option value="novo">+ Novo simulado…</option>
            {(simulados ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.total} questões)
              </option>
            ))}
          </select>
          {destino === 'novo' && (
            <input
              value={novoTitulo}
              onChange={(e) => setNovoTitulo(e.target.value)}
              placeholder="Nome do novo simulado"
              className="min-w-40 flex-1 rounded-lg border border-[var(--mm-border-default)] bg-background px-2 py-1.5 text-xs sm:flex-none"
            />
          )}
          <button
            type="button"
            onClick={addToSimulado}
            disabled={isPending || (destino === 'novo' && !novoTitulo.trim())}
            className="mm-press rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--mm-gold) 0%, var(--mm-gold2) 100%)' }}
          >
            {isPending ? 'Adicionando…' : `Adicionar ao simulado`}
          </button>
        </div>
      )}

      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? 'text-[var(--mm-green)]' : 'text-[#D3402A]'}`}>
          {msg.text}
          {msg.ok && msg.simuladoId && (
            <>
              {' '}
              <Link
                href={`/simulados/${msg.simuladoId}`}
                className="font-semibold text-[var(--mm-gold)] hover:underline"
              >
                Ver simulado →
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  )
}
