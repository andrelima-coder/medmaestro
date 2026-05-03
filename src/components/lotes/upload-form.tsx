'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState, useCallback } from 'react'
import { createExamAction, type CreateExamState } from '@/app/(dashboard)/lotes/novo/actions'
import { InlineProgress } from '@/components/lotes/inline-progress'

type Board = {
  id: string
  name: string
  short_name: string
  supports_booklet_colors: boolean
  default_specialty_id: string | null
}

const YEARS = Array.from(
  { length: new Date().getFullYear() - 2009 + 2 },
  (_, i) => new Date().getFullYear() + 1 - i
)

const PRESET_COLORS = [
  { value: 'unica', label: 'Sem cor (caderno único)' },
  { value: 'amarelo', label: 'Amarelo' },
  { value: 'azul', label: 'Azul' },
  { value: 'rosa', label: 'Rosa' },
  { value: 'verde', label: 'Verde' },
]

const OTHER_SENTINEL = '__other__'
const UNIFIED_SENTINEL = '__unified__'

const COMMENTS_OPTIONS = [
  { value: 'none', label: 'Não, apenas extrair e cadastrar' },
  { value: 'compiled', label: 'Sim, gerar comentário compilado' },
  { value: 'hybrid', label: 'Sim, modelo híbrido (por alternativa + compilado)' },
]

const initialState: CreateExamState = {}

/* ── Field wrapper ──────────────────────────────────────────────────────────── */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--mm-muted)',
        marginBottom: 8,
      }}
    >
      {children}
    </label>
  )
}

/* ── Custom Select ─────────────────────────────────────────────────────────── */

type Option = { value: string; label: string }

function SelectField({
  name,
  options,
  placeholder,
  value,
  onChange,
}: {
  name: string
  options: Option[]
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value) ?? null

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 44,
          padding: '0 14px',
          borderRadius: 10,
          border: open
            ? '1px solid rgba(212,168,67,0.5)'
            : '1px solid rgba(255,255,255,0.10)',
          background: 'var(--mm-bg2)',
          color: selected ? 'var(--mm-text)' : 'var(--mm-muted)',
          fontSize: 13,
          cursor: 'pointer',
          transition: 'border-color 150ms',
        }}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <svg
          style={{
            width: 12,
            height: 12,
            color: 'var(--mm-muted)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 200ms',
            flexShrink: 0,
          }}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2.5 4.5L6 8l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            zIndex: 50,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'var(--mm-surface-elevated)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  fontSize: 13,
                  color: opt.value === value ? 'var(--mm-gold)' : 'var(--mm-text)',
                  background: opt.value === value ? 'rgba(212,168,67,0.08)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 100ms',
                }}
                onMouseEnter={(e) => {
                  if (opt.value !== value)
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={(e) => {
                  if (opt.value !== value)
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Color Select com "Outra cor..." ──────────────────────────────────────── */

function ColorSelectWithCustom({
  name,
  value,
  onChange,
  allowUnified = false,
}: {
  name: string
  value: string
  onChange: (v: string) => void
  allowUnified?: boolean
}) {
  const isPreset = PRESET_COLORS.some((c) => c.value === value)
  const isUnified = value === UNIFIED_SENTINEL
  const [customMode, setCustomMode] = useState(!isPreset && !isUnified && value !== '')
  const [customText, setCustomText] = useState(!isPreset && !isUnified ? value : '')
  const customRef = useRef<HTMLInputElement>(null)

  const selectValue = customMode ? OTHER_SENTINEL : value

  const options = [
    ...PRESET_COLORS,
    ...(allowUnified
      ? [{ value: UNIFIED_SENTINEL, label: 'Gabarito unificado (todas as cores)' }]
      : []),
    { value: OTHER_SENTINEL, label: 'Outra cor…' },
  ]

  function handleSelectChange(v: string) {
    if (v === OTHER_SENTINEL) {
      setCustomMode(true)
      onChange(customText)
      setTimeout(() => customRef.current?.focus(), 50)
    } else {
      setCustomMode(false)
      onChange(v)
    }
  }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setCustomText(v)
    onChange(v.toLowerCase().trim())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* hidden only when customMode — the text input's name carries the value */}
      {!customMode && <input type="hidden" name={name} value={value} />}

      <SelectField
        name=""
        options={options}
        placeholder="Selecione a cor..."
        value={selectValue}
        onChange={handleSelectChange}
      />

      {customMode && (
        <div style={{ position: 'relative' }}>
          <input
            ref={customRef}
            name={name}
            type="text"
            value={customText}
            onChange={handleCustomChange}
            placeholder="Ex: Cinza, Laranja, Branco…"
            style={{
              width: '100%',
              height: 44,
              padding: '0 14px 0 40px',
              borderRadius: 10,
              border: '1px solid rgba(212,168,67,0.4)',
              background: 'rgba(212,168,67,0.04)',
              color: 'var(--mm-text)',
              fontSize: 13,
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {/* pencil icon */}
          <svg
            style={{
              position: 'absolute',
              left: 13,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 14,
              height: 14,
              color: 'var(--mm-gold)',
              pointerEvents: 'none',
            }}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" strokeLinejoin="round" />
          </svg>
          <button
            type="button"
            onClick={() => { setCustomMode(false); onChange('') }}
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--mm-muted)',
              fontSize: 16,
              lineHeight: 1,
              padding: '2px 4px',
            }}
            title="Voltar para opções predefinidas"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Drop Zone ─────────────────────────────────────────────────────────────── */

function DropZone({
  id,
  name,
  label,
  subtitle,
  accept,
  acceptDisplay,
  required,
  optional,
}: {
  id: string
  name: string
  label: string
  subtitle?: string
  accept: string
  acceptDisplay: string
  required?: boolean
  optional?: boolean
}) {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isAccepted = useCallback(
    (f: File) => accept.split(',').some((a) => f.type === a.trim() || f.name.endsWith(a.trim().replace('application/', '.').replace('text/', '.'))),
    [accept]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer.files[0]
      if (!f || !isAccepted(f)) return
      setFile(f)
      const dt = new DataTransfer()
      dt.items.add(f)
      if (inputRef.current) inputRef.current.files = dt.files
    },
    [isAccepted]
  )

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--mm-text)',
          }}
        >
          {label}
        </span>
        {optional && (
          <span style={{ fontSize: 11, color: 'var(--mm-muted)' }}>opcional</span>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          minHeight: 140,
          borderRadius: 12,
          border: `2px dashed ${
            dragging
              ? 'rgba(212,168,67,0.6)'
              : file
              ? 'rgba(212,168,67,0.3)'
              : 'rgba(255,255,255,0.12)'
          }`,
          background: dragging
            ? 'rgba(212,168,67,0.05)'
            : file
            ? 'rgba(212,168,67,0.03)'
            : 'rgba(255,255,255,0.02)',
          cursor: 'pointer',
          transition: 'all 200ms',
          padding: 20,
        }}
      >
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept={accept}
          required={required}
          style={{ display: 'none' }}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        {file ? (
          <>
            <svg
              style={{ width: 28, height: 28, color: 'var(--mm-gold)' }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" />
              <polyline points="14 2 14 8 20 8" strokeLinecap="round" />
              <line x1="9" y1="13" x2="15" y2="13" strokeLinecap="round" />
              <line x1="9" y1="17" x2="13" y2="17" strokeLinecap="round" />
            </svg>
            <p style={{ fontSize: 12, color: 'var(--mm-gold)', fontWeight: 500, maxWidth: '90%', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.name}
            </p>
            <p style={{ fontSize: 11, color: 'var(--mm-muted)' }}>
              {(file.size / 1024 / 1024).toFixed(1)} MB · clique para trocar
            </p>
          </>
        ) : (
          <>
            <svg
              style={{ width: 32, height: 32, color: 'var(--mm-muted)', opacity: 0.5 }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" />
              <polyline points="14 2 14 8 20 8" strokeLinecap="round" />
            </svg>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--mm-text2)' }}>
                {subtitle ?? `Arraste o arquivo aqui ou clique para selecionar`}
              </p>
              <p style={{ fontSize: 11, color: 'var(--mm-muted)', marginTop: 4 }}>
                Formatos aceitos: {acceptDisplay}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Radio Group ───────────────────────────────────────────────────────────── */

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 14px',
              borderRadius: 10,
              border: active
                ? '1px solid rgba(212,168,67,0.4)'
                : '1px solid rgba(255,255,255,0.07)',
              background: active ? 'rgba(212,168,67,0.06)' : 'transparent',
              cursor: 'pointer',
              transition: 'all 150ms',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: active ? '4px solid var(--mm-gold)' : '1.5px solid rgba(255,255,255,0.25)',
                flexShrink: 0,
                transition: 'all 150ms',
                background: 'transparent',
              }}
            />
            <span
              style={{
                fontSize: 13,
                color: active ? 'var(--mm-text)' : 'var(--mm-text2)',
                lineHeight: 1.3,
              }}
            >
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Main Form ─────────────────────────────────────────────────────────────── */

export function UploadForm({ boards }: { boards: Board[] }) {
  const [state, action, pending] = useActionState(createExamAction, initialState)

  const [boardId, setBoardId] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [color, setColor] = useState('')
  const [answerKeyColor, setAnswerKeyColor] = useState('')
  const [autoComments, setAutoComments] = useState('hybrid')

  const selectedBoard = boards.find((b) => b.id === boardId) ?? null
  const showColor = selectedBoard?.supports_booklet_colors ?? true

  // Auto-generate lote name (usa o valor literal — preset ou custom)
  const colorDisplayLabel =
    PRESET_COLORS.find((c) => c.value === color)?.label ?? color ?? ''
  const autoName = [
    selectedBoard?.short_name,
    year,
    showColor && colorDisplayLabel ? `— ${colorDisplayLabel}` : null,
  ]
    .filter(Boolean)
    .join(' ')

  const boardOptions = boards.map((b) => ({ value: b.id, label: `${b.short_name} — ${b.name}` }))
  const yearOptions = YEARS.map((y) => ({ value: String(y), label: String(y) }))

  // Reset cores quando troca para banca sem cadernos coloridos
  useEffect(() => {
    if (selectedBoard && !selectedBoard.supports_booklet_colors) {
      setColor('')
      setAnswerKeyColor('')
    }
  }, [selectedBoard])

  // Após criar o exame, mantém o usuário aqui e mostra a barra inline
  if (state.examId) {
    return <InlineProgress examId={state.examId} />
  }

  return (
    <form action={action}>
      {/* Hidden derived fields */}
      <input type="hidden" name="specialty_id" value={selectedBoard?.default_specialty_id ?? ''} />
      <input type="hidden" name="auto_comments" value={autoComments} />
      {/* answer_key_color: UNIFIED_SENTINEL → null no servidor */}
      <input
        type="hidden"
        name="answer_key_color"
        value={answerKeyColor === UNIFIED_SENTINEL ? '' : answerKeyColor}
      />

      {/* Error banner */}
      {state.error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            borderRadius: 10,
            border: '1px solid rgba(239,83,80,0.25)',
            background: 'rgba(239,83,80,0.08)',
            padding: '12px 16px',
            marginBottom: 20,
          }}
        >
          <svg style={{ width: 16, height: 16, color: '#EF5350', flexShrink: 0, marginTop: 1 }} viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4.5zm0 7a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z" />
          </svg>
          <p style={{ fontSize: 13, color: '#EF5350' }}>{state.error}</p>
        </div>
      )}

      {/* 2-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── LEFT: Metadados ── */}
        <div
          style={{
            background: 'var(--mm-surface)',
            border: '1px solid var(--mm-line)',
            borderRadius: 14,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <span
            className="font-[family-name:var(--font-syne)]"
            style={{ fontSize: 14, fontWeight: 700, color: 'var(--mm-text)' }}
          >
            Metadados do lote
          </span>

          {/* Ano */}
          <div>
            <FieldLabel>Ano da prova</FieldLabel>
            <SelectField
              name="year"
              options={yearOptions}
              placeholder="Selecione o ano..."
              value={year}
              onChange={setYear}
            />
          </div>

          {/* Banca */}
          <div>
            <FieldLabel>Banca</FieldLabel>
            <SelectField
              name="board_id"
              options={boardOptions}
              placeholder="Selecione a banca..."
              value={boardId}
              onChange={setBoardId}
            />
          </div>

          {/* Cor da prova — condicional por banca */}
          {showColor && (
            <div>
              <FieldLabel>Cor da prova</FieldLabel>
              <ColorSelectWithCustom
                name="color"
                value={color}
                onChange={setColor}
              />
              <p style={{ fontSize: 11, color: 'var(--mm-muted)', marginTop: 6 }}>
                Esta banca distribui cadernos com cores diferentes
              </p>
            </div>
          )}

          {/* Cor do gabarito — condicional por banca */}
          {showColor && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <FieldLabel>Cor do gabarito</FieldLabel>
                <span style={{ fontSize: 11, color: 'var(--mm-muted)' }}>opcional</span>
              </div>
              <ColorSelectWithCustom
                name="answer_key_color_select"
                value={answerKeyColor}
                onChange={setAnswerKeyColor}
                allowUnified
              />
              <p style={{ fontSize: 11, color: 'var(--mm-muted)', marginTop: 6 }}>
                Use &ldquo;Gabarito unificado&rdquo; quando um único PDF cobre todas as cores
              </p>
            </div>
          )}

          {/* Nome do lote */}
          <div>
            <FieldLabel>Nome do lote</FieldLabel>
            <input
              name="name"
              type="text"
              value={autoName}
              readOnly
              style={{
                width: '100%',
                height: 44,
                padding: '0 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--mm-text2)',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--mm-line)' }} />

          {/* Comentários automáticos */}
          <div>
            <span
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--mm-text)',
                marginBottom: 12,
              }}
            >
              Comentários automáticos
            </span>
            <RadioGroup
              options={COMMENTS_OPTIONS}
              value={autoComments}
              onChange={setAutoComments}
            />
          </div>
        </div>

        {/* ── RIGHT: Arquivos + Ações ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Caderno da prova */}
          <div
            style={{
              background: 'var(--mm-surface)',
              border: '1px solid var(--mm-line)',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <DropZone
              id="pdf_prova"
              name="pdf_prova"
              label="Caderno da prova (PDF)"
              subtitle="Arraste o PDF aqui ou clique para selecionar"
              accept="application/pdf,.pdf"
              acceptDisplay="PDF (até 20MB)"
              required
            />
          </div>

          {/* Gabarito */}
          <div
            style={{
              background: 'var(--mm-surface)',
              border: '1px solid var(--mm-line)',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <DropZone
              id="pdf_gabarito"
              name="pdf_gabarito"
              label="Gabarito correspondente"
              subtitle="Arraste o gabarito aqui ou clique para selecionar"
              accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/plain,.txt,text/markdown,.md"
              acceptDisplay="PDF, DOCX, TXT, MD"
              optional
            />
          </div>

          {/* Ações */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              disabled={pending}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 10,
                border: 'none',
                background: pending
                  ? 'rgba(212,168,67,0.4)'
                  : 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))',
                color: '#0a0a0a',
                fontFamily: 'var(--font-syne)',
                fontSize: 13,
                fontWeight: 700,
                cursor: pending ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: pending ? 'none' : '0 4px 20px rgba(212,168,67,0.25)',
                transition: 'all 150ms',
              }}
            >
              {pending && (
                <svg style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none">
                  <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {pending ? 'Enviando…' : 'Iniciar processamento →'}
            </button>
            <Link
              href="/lotes"
              style={{
                height: 48,
                padding: '0 20px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'transparent',
                color: 'var(--mm-text2)',
                fontSize: 13,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                textDecoration: 'none',
                transition: 'border-color 150ms',
              }}
            >
              Cancelar
            </Link>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          marginTop: 28,
          paddingTop: 20,
          borderTop: '1px solid var(--mm-line)',
        }}
      >
        <Link
          href="/lotes"
          style={{
            fontSize: 12,
            color: 'var(--mm-muted)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          ← Anterior
        </Link>
        <span style={{ fontSize: 11, color: 'var(--mm-muted)', letterSpacing: '0.05em' }}>
          Tela 2 de 8
        </span>
        <span style={{ fontSize: 12, color: 'var(--mm-muted)' }}>Próxima →</span>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </form>
  )
}
