import type { QuestionComment } from '@/app/(dashboard)/questoes/[id]/comment-actions'

const COMMENT_TYPE_LABELS: Record<string, string> = {
  explicacao: 'Explicação',
  pegadinha: 'Pegadinha',
  referencia: 'Referência',
  mnemonico: 'Mnemônico',
  atualizacao_conduta: 'Atualização de Conduta',
}

interface CommentListProps {
  comments: QuestionComment[]
}

export function CommentList({ comments }: CommentListProps) {
  return (
    <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">
          Comentários
          {comments.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              ({comments.length})
            </span>
          )}
        </h3>
      </div>

      {comments.length === 0 ? (
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
            Nenhum comentário gerado ainda. Use a página de Questões para gerar uma explicação por IA.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {comments.map((comment) => (
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
      )}
    </div>
  )
}
