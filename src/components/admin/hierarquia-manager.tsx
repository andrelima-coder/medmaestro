'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import {
  createBoard,
  updateBoard,
  deleteBoard,
  createSpecialty,
  updateSpecialty,
  deleteSpecialty,
} from '@/app/(dashboard)/configuracoes/hierarquia/actions'
import { Card, CardBody, CardHeader, CardTitle, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

type Board = { id: string; name: string; short_name: string; slug: string }
type Specialty = { id: string; name: string; slug: string }

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

const inputClass =
  'h-9 w-full rounded-lg border border-[var(--mm-border-default)] bg-white/[0.04] px-3 text-xs text-foreground outline-none transition-colors hover:border-[var(--mm-border-hover)] focus:border-[var(--mm-border-active)] focus:bg-white/[0.07]'

const inputMonoClass = inputClass + ' font-mono'

const btnPrimaryClass =
  'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 font-[family-name:var(--font-syne)] text-xs font-bold text-[#0A0A0A] transition-all hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50'

const btnPrimaryStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--mm-gold) 0%, var(--mm-orange) 100%)',
  boxShadow: '0 4px 20px rgba(201,120,30,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
}

const btnGhostClass =
  'inline-flex h-8 items-center rounded-lg border border-[var(--mm-border-default)] bg-transparent px-3 text-xs text-[var(--mm-text2)] transition-colors hover:border-[var(--mm-border-hover)] hover:text-foreground'

const btnDangerClass =
  'inline-flex h-8 items-center rounded-lg border border-[rgba(239,83,80,0.30)] bg-[rgba(239,83,80,0.08)] px-3 text-xs text-[var(--mm-red)] transition-colors hover:bg-[rgba(239,83,80,0.18)] disabled:opacity-50'

// ── BoardRow ─────────────────────────────────────────────────────────────────

function BoardRow({ board, onDeleted }: { board: Board; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(board.name)
  const [shortName, setShortName] = useState(board.short_name)
  const [slug, setSlug] = useState(board.slug)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const save = () => {
    setError('')
    startTransition(async () => {
      const res = await updateBoard(board.id, { name, short_name: shortName, slug })
      if (res.ok) setEditing(false)
      else setError(res.error ?? 'Erro')
    })
  }

  const remove = () => {
    if (!confirm(`Excluir banca "${board.name}"? Isso falhará se houver exames associados.`))
      return
    startTransition(async () => {
      const res = await deleteBoard(board.id)
      if (res.ok) onDeleted()
      else setError(res.error ?? 'Erro')
    })
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)] p-3">
        {error && <p className="text-xs text-[var(--mm-red)]">{error}</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome completo"
            className={inputClass}
          />
          <input
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder="Sigla"
            className={inputClass}
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="slug"
            className={inputMonoClass}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={isPending}
            className={btnPrimaryClass}
            style={btnPrimaryStyle}
          >
            Salvar
          </button>
          <button
            onClick={() => {
              setEditing(false)
              setName(board.name)
              setShortName(board.short_name)
              setSlug(board.slug)
            }}
            className={btnGhostClass}
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--mm-border-default)] bg-white/[0.02] px-4 py-2.5 transition-colors hover:border-[var(--mm-border-hover)]">
      {error && <p className="text-xs text-[var(--mm-red)]">{error}</p>}
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-14 shrink-0 font-[family-name:var(--font-syne)] text-xs font-bold text-[var(--mm-gold)]">
          {board.short_name}
        </span>
        <span className="truncate text-sm text-foreground">{board.name}</span>
        <span className="truncate font-mono text-xs text-[var(--mm-muted)]">{board.slug}</span>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button onClick={() => setEditing(true)} className={btnGhostClass}>
          Editar
        </button>
        <button onClick={remove} disabled={isPending} className={btnDangerClass}>
          Excluir
        </button>
      </div>
    </div>
  )
}

// ── SpecialtyRow ─────────────────────────────────────────────────────────────

function SpecialtyRow({
  specialty,
  onDeleted,
}: {
  specialty: Specialty
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(specialty.name)
  const [slug, setSlug] = useState(specialty.slug)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const save = () => {
    setError('')
    startTransition(async () => {
      const res = await updateSpecialty(specialty.id, { name, slug })
      if (res.ok) setEditing(false)
      else setError(res.error ?? 'Erro')
    })
  }

  const remove = () => {
    if (!confirm(`Excluir especialidade "${specialty.name}"?`)) return
    startTransition(async () => {
      const res = await deleteSpecialty(specialty.id)
      if (res.ok) onDeleted()
      else setError(res.error ?? 'Erro')
    })
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)] p-3">
        {error && <p className="text-xs text-[var(--mm-red)]">{error}</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome"
            className={inputClass}
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="slug"
            className={inputMonoClass}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={isPending}
            className={btnPrimaryClass}
            style={btnPrimaryStyle}
          >
            Salvar
          </button>
          <button
            onClick={() => {
              setEditing(false)
              setName(specialty.name)
              setSlug(specialty.slug)
            }}
            className={btnGhostClass}
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--mm-border-default)] bg-white/[0.02] px-4 py-2.5 transition-colors hover:border-[var(--mm-border-hover)]">
      {error && <p className="text-xs text-[var(--mm-red)]">{error}</p>}
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-sm text-foreground">{specialty.name}</span>
        <span className="truncate font-mono text-xs text-[var(--mm-muted)]">
          {specialty.slug}
        </span>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button onClick={() => setEditing(true)} className={btnGhostClass}>
          Editar
        </button>
        <button onClick={remove} disabled={isPending} className={btnDangerClass}>
          Excluir
        </button>
      </div>
    </div>
  )
}

// ── NewBoardForm ─────────────────────────────────────────────────────────────

function NewBoardForm() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleNameChange = (v: string) => {
    setName(v)
    if (!slug || slug === slugify(name)) setSlug(slugify(v))
  }

  const submit = () => {
    setError('')
    const fd = new FormData()
    fd.set('name', name)
    fd.set('short_name', shortName)
    fd.set('slug', slug)
    startTransition(async () => {
      const res = await createBoard(fd)
      if (res.ok) {
        setName('')
        setShortName('')
        setSlug('')
        setOpen(false)
      } else setError(res.error ?? 'Erro')
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--mm-border-hover)] bg-transparent px-3 text-xs text-[var(--mm-muted)] transition-colors hover:border-[var(--mm-border-active)] hover:text-[var(--mm-gold)]"
      >
        <Plus className="size-3.5" />
        Nova banca
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)] p-3">
      {error && <p className="text-xs text-[var(--mm-red)]">{error}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Nome completo"
          className={inputClass}
        />
        <input
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          placeholder="Sigla (ex: REVALIDA)"
          className={inputClass}
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug"
          className={inputMonoClass}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={isPending || !name || !shortName || !slug}
          className={cn(
            btnPrimaryClass,
            (!name || !shortName || !slug) && 'cursor-not-allowed'
          )}
          style={btnPrimaryStyle}
        >
          Criar
        </button>
        <button
          onClick={() => {
            setOpen(false)
            setName('')
            setShortName('')
            setSlug('')
            setError('')
          }}
          className={btnGhostClass}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── NewSpecialtyForm ─────────────────────────────────────────────────────────

function NewSpecialtyForm() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleNameChange = (v: string) => {
    setName(v)
    if (!slug || slug === slugify(name)) setSlug(slugify(v))
  }

  const submit = () => {
    setError('')
    const fd = new FormData()
    fd.set('name', name)
    fd.set('slug', slug)
    startTransition(async () => {
      const res = await createSpecialty(fd)
      if (res.ok) {
        setName('')
        setSlug('')
        setOpen(false)
      } else setError(res.error ?? 'Erro')
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--mm-border-hover)] bg-transparent px-3 text-xs text-[var(--mm-muted)] transition-colors hover:border-[var(--mm-border-active)] hover:text-[var(--mm-gold)]"
      >
        <Plus className="size-3.5" />
        Nova especialidade
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--mm-border-active)] bg-[var(--mm-gold-bg)] p-3">
      {error && <p className="text-xs text-[var(--mm-red)]">{error}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Nome (ex: Clínica Médica)"
          className={inputClass}
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug"
          className={inputMonoClass}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={isPending || !name || !slug}
          className={cn(
            btnPrimaryClass,
            (!name || !slug) && 'cursor-not-allowed'
          )}
          style={btnPrimaryStyle}
        >
          Criar
        </button>
        <button
          onClick={() => {
            setOpen(false)
            setName('')
            setSlug('')
            setError('')
          }}
          className={btnGhostClass}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── HierarquiaManager ────────────────────────────────────────────────────────

export function HierarquiaManager({
  initialBoards,
  initialSpecialties,
}: {
  initialBoards: Board[]
  initialSpecialties: Specialty[]
}) {
  const [boards, setBoards] = useState(initialBoards)
  const [specialties, setSpecialties] = useState(initialSpecialties)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Bancas */}
      <Card glow="gold">
        <CardHeader>
          <CardTitle>Bancas</CardTitle>
          <Badge tone="gold">{boards.length}</Badge>
        </CardHeader>
        <CardBody className="flex flex-col gap-2">
          {boards.length === 0 && (
            <p className="py-4 text-center text-xs text-[var(--mm-muted)]">
              Nenhuma banca cadastrada ainda.
            </p>
          )}
          {boards.map((b) => (
            <BoardRow
              key={b.id}
              board={b}
              onDeleted={() => setBoards((prev) => prev.filter((x) => x.id !== b.id))}
            />
          ))}
          <NewBoardForm />
        </CardBody>
      </Card>

      {/* Especialidades */}
      <Card>
        <CardHeader>
          <CardTitle>Especialidades</CardTitle>
          <Badge tone="muted">{specialties.length}</Badge>
        </CardHeader>
        <CardBody className="flex flex-col gap-2">
          {specialties.length === 0 && (
            <p className="py-4 text-center text-xs text-[var(--mm-muted)]">
              Nenhuma especialidade cadastrada ainda.
            </p>
          )}
          {specialties.map((s) => (
            <SpecialtyRow
              key={s.id}
              specialty={s}
              onDeleted={() =>
                setSpecialties((prev) => prev.filter((x) => x.id !== s.id))
              }
            />
          ))}
          <NewSpecialtyForm />
        </CardBody>
      </Card>
    </div>
  )
}
