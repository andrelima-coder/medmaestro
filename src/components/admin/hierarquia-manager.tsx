'use client'

import { useState, useTransition } from 'react'
import {
  createBoard, updateBoard, deleteBoard,
  createSpecialty, updateSpecialty, deleteSpecialty,
} from '@/app/(dashboard)/configuracoes/hierarquia/actions'

type Board = { id: string; name: string; short_name: string; slug: string }
type Specialty = { id: string; name: string; slug: string }

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

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
    if (!confirm(`Excluir banca "${board.name}"? Isso falhará se houver exames associados.`)) return
    startTransition(async () => {
      const res = await deleteBoard(board.id)
      if (res.ok) onDeleted()
      else setError(res.error ?? 'Erro')
    })
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-white/8 bg-[var(--mm-surface)] p-3">
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="grid grid-cols-3 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome completo"
            className="h-8 rounded border border-white/10 bg-black/20 px-2 text-xs text-foreground outline-none"
          />
          <input
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder="Sigla"
            className="h-8 rounded border border-white/10 bg-black/20 px-2 text-xs text-foreground outline-none"
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="slug"
            className="h-8 rounded border border-white/10 bg-black/20 px-2 text-xs font-mono text-foreground outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={isPending}
            className="h-7 px-3 rounded bg-[var(--mm-gold)] text-xs font-medium text-black disabled:opacity-50"
          >
            Salvar
          </button>
          <button
            onClick={() => { setEditing(false); setName(board.name); setShortName(board.short_name); setSlug(board.slug) }}
            className="h-7 px-3 rounded border border-white/10 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-[var(--mm-surface)]/40 px-4 py-2.5">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs font-medium text-[var(--mm-gold)] w-14 shrink-0">{board.short_name}</span>
        <span className="text-sm text-foreground truncate">{board.name}</span>
        <span className="text-xs font-mono text-muted-foreground/50 truncate">{board.slug}</span>
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="h-7 px-2.5 rounded border border-white/8 text-xs text-muted-foreground hover:text-foreground hover:bg-white/4"
        >
          Editar
        </button>
        <button
          onClick={remove}
          disabled={isPending}
          className="h-7 px-2.5 rounded border border-white/8 text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          Excluir
        </button>
      </div>
    </div>
  )
}

// ── SpecialtyRow ─────────────────────────────────────────────────────────────

function SpecialtyRow({ specialty, onDeleted }: { specialty: Specialty; onDeleted: () => void }) {
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
      <div className="flex flex-col gap-2 rounded-lg border border-white/8 bg-[var(--mm-surface)] p-3">
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome"
            className="h-8 rounded border border-white/10 bg-black/20 px-2 text-xs text-foreground outline-none"
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="slug"
            className="h-8 rounded border border-white/10 bg-black/20 px-2 text-xs font-mono text-foreground outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={isPending}
            className="h-7 px-3 rounded bg-[var(--mm-gold)] text-xs font-medium text-black disabled:opacity-50"
          >
            Salvar
          </button>
          <button
            onClick={() => { setEditing(false); setName(specialty.name); setSlug(specialty.slug) }}
            className="h-7 px-3 rounded border border-white/10 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-[var(--mm-surface)]/40 px-4 py-2.5">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm text-foreground truncate">{specialty.name}</span>
        <span className="text-xs font-mono text-muted-foreground/50 truncate">{specialty.slug}</span>
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="h-7 px-2.5 rounded border border-white/8 text-xs text-muted-foreground hover:text-foreground hover:bg-white/4"
        >
          Editar
        </button>
        <button
          onClick={remove}
          disabled={isPending}
          className="h-7 px-2.5 rounded border border-white/8 text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
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
    fd.set('name', name); fd.set('short_name', shortName); fd.set('slug', slug)
    startTransition(async () => {
      const res = await createBoard(fd)
      if (res.ok) { setName(''); setShortName(''); setSlug(''); setOpen(false) }
      else setError(res.error ?? 'Erro')
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-8 px-3 rounded-lg border border-dashed border-white/15 text-xs text-muted-foreground hover:text-foreground hover:border-white/30 transition-colors"
      >
        + Nova banca
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/8 bg-[var(--mm-surface)] p-3">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="grid grid-cols-3 gap-2">
        <input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Nome completo"
          className="h-8 rounded border border-white/10 bg-black/20 px-2 text-xs text-foreground outline-none focus:border-[var(--mm-gold)]/40"
        />
        <input
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          placeholder="Sigla (ex: REVALIDA)"
          className="h-8 rounded border border-white/10 bg-black/20 px-2 text-xs text-foreground outline-none focus:border-[var(--mm-gold)]/40"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug"
          className="h-8 rounded border border-white/10 bg-black/20 px-2 text-xs font-mono text-foreground outline-none focus:border-[var(--mm-gold)]/40"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={isPending || !name || !shortName || !slug}
          className="h-7 px-3 rounded bg-[var(--mm-gold)] text-xs font-medium text-black disabled:opacity-50"
        >
          Criar
        </button>
        <button
          onClick={() => { setOpen(false); setName(''); setShortName(''); setSlug(''); setError('') }}
          className="h-7 px-3 rounded border border-white/10 text-xs text-muted-foreground hover:text-foreground"
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
    fd.set('name', name); fd.set('slug', slug)
    startTransition(async () => {
      const res = await createSpecialty(fd)
      if (res.ok) { setName(''); setSlug(''); setOpen(false) }
      else setError(res.error ?? 'Erro')
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-8 px-3 rounded-lg border border-dashed border-white/15 text-xs text-muted-foreground hover:text-foreground hover:border-white/30 transition-colors"
      >
        + Nova especialidade
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/8 bg-[var(--mm-surface)] p-3">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Nome (ex: Clínica Médica)"
          className="h-8 rounded border border-white/10 bg-black/20 px-2 text-xs text-foreground outline-none focus:border-[var(--mm-gold)]/40"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug"
          className="h-8 rounded border border-white/10 bg-black/20 px-2 text-xs font-mono text-foreground outline-none focus:border-[var(--mm-gold)]/40"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={isPending || !name || !slug}
          className="h-7 px-3 rounded bg-[var(--mm-gold)] text-xs font-medium text-black disabled:opacity-50"
        >
          Criar
        </button>
        <button
          onClick={() => { setOpen(false); setName(''); setSlug(''); setError('') }}
          className="h-7 px-3 rounded border border-white/10 text-xs text-muted-foreground hover:text-foreground"
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Bancas */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Bancas <span className="ml-1 text-muted-foreground font-normal">({boards.length})</span>
          </h2>
        </div>
        <div className="flex flex-col gap-2">
          {boards.map((b) => (
            <BoardRow
              key={b.id}
              board={b}
              onDeleted={() => setBoards((prev) => prev.filter((x) => x.id !== b.id))}
            />
          ))}
          <NewBoardForm />
        </div>
      </section>

      {/* Especialidades */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Especialidades <span className="ml-1 text-muted-foreground font-normal">({specialties.length})</span>
          </h2>
        </div>
        <div className="flex flex-col gap-2">
          {specialties.map((s) => (
            <SpecialtyRow
              key={s.id}
              specialty={s}
              onDeleted={() => setSpecialties((prev) => prev.filter((x) => x.id !== s.id))}
            />
          ))}
          <NewSpecialtyForm />
        </div>
      </section>
    </div>
  )
}
