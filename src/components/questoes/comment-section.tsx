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
  const [generated, setGenerated] = useState(false)

  function handleGenerate() {
    setError(null)
    setGenerated(false)
    startTransition(async () => {
      const result = await generateAiComment(questionId)
      if (result.ok) {
        setGenerated(true)
        router.refresh()
      } else {
        setError(result.error ?? 'Erro desconhecido')
      }
    })
  }

  return (
    <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Comentários</h3>
        <button
          onClick={handleGenerate}
          disabled={isPending}
          className="text-xs rounded-lg border border-white/8 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors disabled:opacity-40"
        >
          {isPending ? 'Gerando…' : '✦ Gerar por IA'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {generated && !isPending && (
        <p className="text-xs text-green-400">Comentário gerado com sucesso.</p>
      )}

      {initialComments.length === 0 && !isPending && (
        <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
      )}

      <div className="flex flex-col gap-4">
        {initialComments.map((comment) => (
          <div key={comment.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--mm-gold)]">
                {COMMENT_TYPE_LABELS[comment.comment_type] ?? comment.comment_type}
              </span>
              {comment.created_by_ai && (
                <span className="text-xs text-muted-foreground/60">IA</span>
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
    </div>
  )
}
