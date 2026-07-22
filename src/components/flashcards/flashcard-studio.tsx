'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { sanitizeRichTextHtml } from '@/lib/utils/sanitize-html'
import {
  updateBancoFlashcardAction,
  createBancoFlashcardAction,
  uploadFlashcardImageAction,
  listSourceFiguresAction,
  attachSourceFigureAction,
  type BancoFlashcard,
  type SourceFigure,
} from '@/app/(dashboard)/banco-flashcards/actions'

type Mode = 'view' | 'edit' | 'create'

const SCOPE_LABEL: Record<string, string> = {
  statement: 'Enunciado',
  alternative_a: 'Alt. A',
  alternative_b: 'Alt. B',
  alternative_c: 'Alt. C',
  alternative_d: 'Alt. D',
  alternative_e: 'Alt. E',
}

/**
 * Estúdio de flashcards estilo Anki: ver (com virar carta), editar e criar.
 * Suporta inserir figuras da questão original, upload e colar imagem.
 */
export function FlashcardStudio({
  cards,
  startIndex,
  initialMode = 'view',
  onClose,
  onChanged,
}: {
  cards: BancoFlashcard[]
  startIndex: number
  initialMode?: Mode
  onClose: () => void
  onChanged: () => void
}) {
  const isCreate = initialMode === 'create'
  const [index, setIndex] = useState(startIndex)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [flipped, setFlipped] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const card = isCreate ? null : cards[index] ?? null

  // Campos de edição/criação
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [difficulty, setDifficulty] = useState(3)
  const [cardType, setCardType] = useState<'qa' | 'cloze'>('qa')

  const ownerId = card?.source_question_id ?? card?.id ?? 'manual0000'

  const loadFields = useCallback((c: BancoFlashcard | null) => {
    setFront(c?.front ?? '')
    setBack(c?.back ?? '')
    setDifficulty(c?.difficulty ?? 3)
    setCardType((c?.card_type as 'qa' | 'cloze') === 'cloze' ? 'cloze' : 'qa')
  }, [])

  useEffect(() => {
    if (mode !== 'view') loadFields(card)
    setFlipped(false)
    setError(null)
  }, [index, mode, card, loadFields])

  // Fechar com ESC; navegar com setas / espaço no modo ver.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') return onClose()
      if (mode !== 'view') return
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped((f) => !f)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, index, cards.length])

  function go(delta: number) {
    setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + delta)))
    setFlipped(false)
  }

  const uploadImage = useCallback(
    async (file: File): Promise<{ url: string } | { error: string }> => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await uploadFlashcardImageAction(ownerId, fd)
      return res.url ? { url: res.url } : { error: res.error ?? 'Falha no upload' }
    },
    [ownerId]
  )

  function saveEdit() {
    if (!card) return
    startTransition(async () => {
      const res = await updateBancoFlashcardAction(card.id, {
        front: sanitizeRichTextHtml(front),
        back: sanitizeRichTextHtml(back),
        difficulty,
      })
      if (res.ok) {
        setMode('view')
        onChanged()
      } else {
        setError(res.error ?? 'Falha ao salvar')
      }
    })
  }

  function createNew() {
    startTransition(async () => {
      const res = await createBancoFlashcardAction({
        front: sanitizeRichTextHtml(front),
        back: sanitizeRichTextHtml(back),
        difficulty,
        cardType,
      })
      if (res.ok) {
        onChanged()
        onClose()
      } else {
        setError(res.error ?? 'Falha ao criar')
      }
    })
  }

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: 'min(760px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0E0E14',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <strong style={{ fontSize: 14, color: '#E8E8EA' }}>
            {mode === 'create' ? 'Novo flashcard' : mode === 'edit' ? 'Editar flashcard' : 'Estudar'}
          </strong>
          {mode === 'view' && (
            <span style={{ fontSize: 12, color: '#9AA0AA' }}>
              {index + 1} / {cards.length}
              {card?.exam_label ? ` · ${card.exam_label}` : ''}
              {card?.question_number != null ? ` · Q${card.question_number}` : ''}
            </span>
          )}
          <button onClick={onClose} style={{ marginLeft: 'auto', ...btnGhost }}>Fechar ✕</button>
        </div>

        <div style={{ padding: 18 }}>
          {error && (
            <div style={{ marginBottom: 12, fontSize: 12, color: '#EF5350', background: 'rgba(239,83,80,0.08)', border: '1px solid rgba(239,83,80,0.25)', borderRadius: 8, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          {mode === 'view' && card ? (
            <ViewCard card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
          ) : (
            <EditForm
              front={front}
              back={back}
              difficulty={difficulty}
              cardType={cardType}
              showType={mode === 'create'}
              sourceQuestionId={card?.source_question_id ?? null}
              ownerId={ownerId}
              onFront={setFront}
              onBack={setBack}
              onDifficulty={setDifficulty}
              onCardType={setCardType}
              uploadImage={uploadImage}
            />
          )}
        </div>

        {/* Rodapé de ações */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {mode === 'view' && card && (
            <>
              <button onClick={() => go(-1)} disabled={index <= 0} style={btnGhost}>← Anterior</button>
              <button onClick={() => setFlipped((f) => !f)} style={btnSecondary}>
                {flipped ? 'Ver frente' : 'Mostrar resposta'}
              </button>
              <button onClick={() => go(1)} disabled={index >= cards.length - 1} style={btnGhost}>Próximo →</button>
              <button onClick={() => setMode('edit')} style={{ marginLeft: 'auto', ...btnPrimary(true) }}>Editar</button>
            </>
          )}
          {mode === 'edit' && (
            <>
              <button onClick={() => setMode('view')} style={btnGhost}>Cancelar</button>
              <button onClick={saveEdit} disabled={pending} style={{ marginLeft: 'auto', ...btnPrimary(!pending) }}>
                {pending ? 'Salvando…' : 'Salvar'}
              </button>
            </>
          )}
          {mode === 'create' && (
            <>
              <button onClick={onClose} style={btnGhost}>Cancelar</button>
              <button onClick={createNew} disabled={pending} style={{ marginLeft: 'auto', ...btnPrimary(!pending) }}>
                {pending ? 'Criando…' : 'Criar flashcard'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ViewCard({ card, flipped, onFlip }: { card: BancoFlashcard; flipped: boolean; onFlip: () => void }) {
  return (
    <div
      onClick={onFlip}
      style={{
        cursor: 'pointer',
        minHeight: 260,
        borderRadius: 14,
        border: `1px solid ${flipped ? 'rgba(102,187,106,0.35)' : 'rgba(201,168,76,0.3)'}`,
        background: flipped ? 'rgba(102,187,106,0.04)' : 'rgba(201,168,76,0.03)',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: flipped ? '#66BB6A' : '#C9A84C', fontWeight: 700 }}>
        {flipped ? 'Resposta' : 'Pergunta'}
      </div>
      <div
        className="fc-html"
        style={{ fontSize: 16, lineHeight: 1.6, color: '#E8E8EA' }}
        dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(flipped ? card.back : card.front) }}
      />
      {!flipped && (
        <div style={{ marginTop: 'auto', fontSize: 11, color: '#9AA0AA' }}>
          Clique no cartão ou pressione Espaço para revelar
        </div>
      )}
      <style jsx global>{`
        .fc-html img { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; border: 1px solid rgba(255,255,255,0.1); }
        .fc-html p { margin: 0 0 8px; }
        .fc-html ul, .fc-html ol { padding-left: 1.4rem; }
      `}</style>
    </div>
  )
}

function EditForm({
  front,
  back,
  difficulty,
  cardType,
  showType,
  sourceQuestionId,
  ownerId,
  onFront,
  onBack,
  onDifficulty,
  onCardType,
  uploadImage,
}: {
  front: string
  back: string
  difficulty: number
  cardType: 'qa' | 'cloze'
  showType: boolean
  sourceQuestionId: string | null
  ownerId: string
  onFront: (v: string) => void
  onBack: (v: string) => void
  onDifficulty: (v: number) => void
  onCardType: (v: 'qa' | 'cloze') => void
  uploadImage: (file: File) => Promise<{ url: string } | { error: string }>
}) {
  const figureButton = useMemo(() => {
    if (!sourceQuestionId) return undefined
    return (insertImage: (url: string) => void) => (
      <FigurePickerButton questionId={sourceQuestionId} ownerId={ownerId} onInsert={insertImage} />
    )
  }, [sourceQuestionId, ownerId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={fieldLabel}>Frente (pergunta)</label>
        <RichTextEditor
          value={front}
          onChange={onFront}
          placeholder="Pergunta…"
          minHeight={90}
          ariaLabel="Frente do card"
          onUploadImage={uploadImage}
          allowPaste
          extraButtons={figureButton}
        />
      </div>
      <div>
        <label style={fieldLabel}>Verso (resposta)</label>
        <RichTextEditor
          value={back}
          onChange={onBack}
          placeholder="Resposta + justificativa clínica…"
          minHeight={120}
          ariaLabel="Verso do card"
          onUploadImage={uploadImage}
          allowPaste
          extraButtons={figureButton}
        />
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#9AA0AA' }}>
          Dificuldade
          <select value={difficulty} onChange={(e) => onDifficulty(Number(e.target.value))} style={selectStyle}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {showType && (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#9AA0AA' }}>
            Tipo
            <select value={cardType} onChange={(e) => onCardType(e.target.value as 'qa' | 'cloze')} style={selectStyle}>
              <option value="qa">Q&A</option>
              <option value="cloze">Cloze</option>
            </select>
          </label>
        )}
        {sourceQuestionId && (
          <span style={{ fontSize: 11, color: '#9AA0AA' }}>
            Use o botão 📎 na barra para inserir figuras da questão original. Também dá para colar (Ctrl+V) ou subir imagem 🖼.
          </span>
        )}
      </div>
    </div>
  )
}

function FigurePickerButton({
  questionId,
  ownerId,
  onInsert,
}: {
  questionId: string
  ownerId: string
  onInsert: (url: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [figs, setFigs] = useState<SourceFigure[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && figs === null) {
      setLoading(true)
      const res = await listSourceFiguresAction(questionId)
      setFigs(res)
      setLoading(false)
    }
  }

  async function pick(fig: SourceFigure) {
    setBusy(fig.id)
    const res = await attachSourceFigureAction(fig.id, ownerId)
    setBusy(null)
    if (res.url) {
      onInsert(res.url)
      setOpen(false)
    }
  }

  return (
    <span style={{ position: 'relative' }}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        title="Inserir figura da questão original"
        className="px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/8 rounded transition-colors"
      >
        📎 Figura
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 70,
            width: 320,
            maxHeight: 320,
            overflowY: 'auto',
            background: '#12121A',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            padding: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          }}
        >
          {loading ? (
            <div style={{ fontSize: 12, color: '#9AA0AA', padding: 8 }}>Carregando figuras…</div>
          ) : !figs || figs.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9AA0AA', padding: 8 }}>A questão original não tem figuras.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {figs.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => pick(f)}
                  disabled={busy !== null}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: 6,
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={SCOPE_LABEL[f.scope] ?? f.scope} style={{ width: '100%', height: 90, objectFit: 'contain', borderRadius: 4, background: '#0A0A0A' }} />
                  <span style={{ fontSize: 10, color: '#9AA0AA' }}>
                    {busy === f.id ? 'Inserindo…' : SCOPE_LABEL[f.scope] ?? f.scope}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  )
}

const fieldLabel: React.CSSProperties = { display: 'block', fontSize: 11, color: '#9AA0AA', marginBottom: 5, fontWeight: 600 }
const selectStyle: React.CSSProperties = { background: '#1A1A22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: '#E8E8EA' }
const btnGhost: React.CSSProperties = { background: 'transparent', color: '#9AA0AA', border: '1px solid rgba(255,255,255,0.12)', fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }
const btnSecondary: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', color: '#E8E8EA', border: '1px solid rgba(255,255,255,0.12)', fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer' }
function btnPrimary(active: boolean): React.CSSProperties {
  return {
    background: active ? 'linear-gradient(135deg, #C9A84C, #E0C56E)' : '#2A2A33',
    color: active ? '#0A0A0A' : '#9AA0AA',
    fontSize: 12,
    fontWeight: 700,
    padding: '7px 16px',
    borderRadius: 8,
    border: 'none',
    cursor: active ? 'pointer' : 'default',
  }
}
