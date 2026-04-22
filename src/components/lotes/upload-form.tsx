'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createExamAction, type CreateExamState } from '@/app/(dashboard)/lotes/novo/actions'

type Specialty = { id: string; name: string }
type Board = { id: string; name: string; short_name: string }

const COLORS = ['AMARELO', 'AZUL', 'ROSA', 'VERDE'] as const

const initialState: CreateExamState = {}

export function UploadForm({ specialties, boards }: { specialties: Specialty[]; boards: Board[] }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(createExamAction, initialState)

  useEffect(() => {
    if (state.examId) {
      router.push(`/lotes/${state.examId}`)
    }
  }, [state.examId, router])

  return (
    <form action={action} className="flex flex-col gap-5 max-w-lg">
      {state.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="board_id">
          Banca
        </label>
        <select
          id="board_id"
          name="board_id"
          required
          className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:border-ring focus:outline-none"
        >
          <option value="">Selecione...</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.short_name} — {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="specialty_id">
          Especialidade
        </label>
        <select
          id="specialty_id"
          name="specialty_id"
          required
          className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:border-ring focus:outline-none"
        >
          <option value="">Selecione...</option>
          {specialties.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="year">
          Ano
        </label>
        <input
          id="year"
          name="year"
          type="number"
          required
          min={2000}
          max={2050}
          placeholder="ex: 2025"
          className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:border-ring focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="color">
          Cor da prova
        </label>
        <select
          id="color"
          name="color"
          required
          className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:border-ring focus:outline-none"
        >
          <option value="">Selecione...</option>
          {COLORS.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0) + c.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="pdf_prova">
          PDF da prova <span className="text-muted-foreground">(obrigatório)</span>
        </label>
        <input
          id="pdf_prova"
          name="pdf_prova"
          type="file"
          accept=".pdf,application/pdf"
          required
          className="text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary-foreground"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="pdf_gabarito">
          PDF do gabarito <span className="text-muted-foreground">(opcional)</span>
        </label>
        <input
          id="pdf_gabarito"
          name="pdf_gabarito"
          type="file"
          accept=".pdf,application/pdf"
          className="text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-xs file:font-medium file:text-secondary-foreground"
        />
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? 'Enviando...' : 'Criar lote'}
      </Button>
    </form>
  )
}
