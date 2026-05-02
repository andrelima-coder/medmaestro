import * as React from "react"

import { cn } from "@/lib/utils"

interface PipelineRowProps extends React.HTMLAttributes<HTMLDivElement> {
  leading?: React.ReactNode
  label: React.ReactNode
  /** Progresso 0–100. */
  progress: number
  /** Cor da barra (CSS color ou gradient). */
  fillColor?: string
  trailing?: React.ReactNode
  /** Destacar a linha (live state). */
  highlighted?: boolean
}

function PipelineRow({
  leading,
  label,
  progress,
  fillColor = "var(--mm-gold)",
  trailing,
  highlighted = false,
  className,
  ...props
}: PipelineRowProps) {
  const clamped = Math.max(0, Math.min(100, progress))
  return (
    <div
      data-slot="pipeline-row"
      className={cn(
        "flex items-center gap-3 border-b border-[rgba(255,255,255,0.03)] py-2.5 last:border-b-0",
        highlighted && "rounded-lg bg-[rgba(255,107,53,0.04)] px-1 py-2",
        className
      )}
      {...props}
    >
      {leading && (
        <div className="w-9 text-center text-xs text-[var(--mm-muted)] flex-shrink-0">
          {leading}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="mb-1 text-xs text-foreground">{label}</div>
        <div
          role="progressbar"
          aria-valuenow={Math.round(clamped)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-[5px] overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]"
        >
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${clamped}%`, background: fillColor }}
          />
        </div>
      </div>
      {trailing && <div className="flex-shrink-0">{trailing}</div>}
    </div>
  )
}

export { PipelineRow }
