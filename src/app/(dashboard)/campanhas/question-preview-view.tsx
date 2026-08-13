import type { QuestionPreview } from './actions'

export function QuestionPreviewView({ pv }: { pv: QuestionPreview }) {
  const letters = ['A', 'B', 'C', 'D', 'E']
  return (
    <div className="space-y-3 text-sm">
      <p className="whitespace-pre-wrap text-foreground">{pv.stem || '(sem enunciado)'}</p>
      <ul className="space-y-1">
        {letters.map((L) => {
          const text = pv.alternatives?.[L]
          if (!text) return null
          const correct = pv.correctAnswer === L
          return (
            <li
              key={L}
              className={`rounded-md px-2 py-1 ${
                correct ? 'bg-[rgba(0,96,72,0.15)] font-medium text-[#006048]' : 'text-foreground'
              }`}
            >
              <strong>{L})</strong> {text}
              {correct ? ' ✓' : ''}
            </li>
          )
        })}
      </ul>
      {pv.correctAnswer == null && (
        <p className="text-xs text-[#9E6606]">Sem gabarito cadastrado.</p>
      )}
      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Comentários</p>
        {pv.comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem comentários.</p>
        ) : (
          <div className="space-y-2">
            {pv.comments.map((c, i) => (
              <div key={i} className="rounded-md bg-background p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {c.type || 'comentário'}
                </p>
                <p className="whitespace-pre-wrap text-foreground">{c.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
