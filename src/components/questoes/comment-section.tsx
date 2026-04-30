'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { QuestionComment } from '@/app/(dashboard)/questoes/[id]/comment-actions'
import { generateAiComment } from '@/app/(dashboard)/questoes/[id]/comment-actions'

const COMMENT_TYPE_LABELS: Record<string, string> = {
  explicacao: 'Explicação',
  pegadinha: 'Pegadinha',
  referencia: 'Referência',
  mnemonico: 'Mnemônico',
  atualizacao_conduta: 'Atualização de Conduta',
}

interface CommentSectionProps {
  questionId: string
  initialComments: QuestionComment[]
}

export function CommentSection({ questionId, initialComments }: CommentSectionProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleGenerate() {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await generateAiComment(questionId)
      if (result.ok) {
        setSuccess(true)
        router.refresh()
        setTimeout(() => setSuccess(false), 3000)
      } else {
        setError(result.error ?? 'Erro desconhecido')
      }
    })
  }

  const hasComments = initialComments.length > 0

  return (
    <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">
          Comentários
          {hasComments && (
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              ({initialComments.length})
            </span>
          )}
        </h3>
        <button
          onClick={handleGenerate}
          disabled={isPending}
          style={{
            background: isPending
              ? 'var(--mm-bg2)'
              : 'linear-gradient(135deg, var(--mm-gold), var(--mm-gold2))',
            color: isPending ? 'var(--mm-muted)' : '#0a0a0a',
            fontFamily: 'var(--font-syne)',
            fontSize: 12,
            fontWeight: 700,
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            cursor: isPending ? 'default' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: isPending ? 'none' : '0 2px 12px rgba(212,168,67,0.25)',
            transition: 'all 0.15s',
          }}
        >
          {isPending ? (
            <>
              <span
                style={{
                  width: 10,
                  height: 10,
                  border: '2px solid currentColor',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  display: 'inline-block',
                }}
              />
              Gerando comentário…
            </>
          ) : hasComments ? (
            <>✦ Gerar novo comentário</>
          ) : (
            <>✦ Gerar comentário por IA</>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400">
          ✓ Comentário gerado com sucesso.
        </div>
      )}

      {!hasComments && !isPending && !error && (
        <div
          style={{
            background: 'var(--mm-bg2)',
            border: '1px dashed var(--mm-line2)',
            borderRadius: 8,
            padding: 20,
            textAlign: 'center',
          }}
        >
          <p className="text-xs text-muted-foreground">
            Nenhum comentário ainda. Clique em <strong>Gerar comentário por IA</strong>{' '}
            para criar uma explicação didática automaticamente.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {initialComments.map((comment) => (
          <div
            key={comment.id}
            className="flex flex-col gap-1.5 rounded-lg border border-white/5 bg-white/2 p-4"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--mm-gold)]">
                {COMMENT_TYPE_LABELS[comment.comment_type] ?? comment.comment_type}
              </span>
              {comment.created_by_ai && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    background: 'rgba(79,195,247,0.1)',
                    color: '#4FC3F7',
                    fontWeight: 600,
                  }}
                >
                  IA
                </span>
              )}
              {comment.ai_model && (
                <span className="text-xs text-muted-foreground/40">{comment.ai_model}</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground/40">
                {new Date(comment.created_at).toLocaleDateString('pt-BR')}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {comment.content}
            </p>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
