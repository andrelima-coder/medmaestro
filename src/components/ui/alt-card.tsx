import * as React from "react"

import { cn } from "@/lib/utils"

interface AltCardProps extends React.HTMLAttributes<HTMLDivElement> {
  letter: string
  /** Marca a alternativa correta (gabarito). */
  correct?: boolean
}

function AltCard({
  letter,
  correct = false,
  className,
  children,
  ...props
}: AltCardProps) {
  return (
    <div
      data-slot="alt-card"
      aria-label={correct ? `Alternativa ${letter} (correta)` : `Alternativa ${letter}`}
      className={cn(
        "mm-chip mb-2 flex items-start gap-3 rounded-lg border px-3.5 py-3",
        correct
          ? "border-[rgba(212,7,84,0.3)] bg-[rgba(212,7,84,0.08)]"
          : "border-[var(--mm-border-default)] bg-[rgba(14,40,65,0.02)]",
        className
      )}
      {...props}
    >
      <div
        aria-hidden
        className={cn(
          "mm-chip flex size-[26px] flex-shrink-0 items-center justify-center rounded-md border text-[11px] font-bold",
          correct
            ? "mm-pop-in border-[rgba(212,7,84,0.5)] bg-[rgba(212,7,84,0.10)] text-[var(--mm-gold)]"
            : "border-[var(--mm-border-default)] text-[var(--mm-muted)]"
        )}
      >
        {letter}
      </div>
      {correct && <span className="sr-only">Resposta correta:</span>}
      <div
        className={cn(
          "text-[13px] leading-[1.6]",
          correct ? "text-foreground" : "text-[var(--mm-text2)]"
        )}
      >
        {children}
      </div>
    </div>
  )
}

export { AltCard }
