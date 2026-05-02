import * as React from "react"

import { cn } from "@/lib/utils"

interface ParetoBarProps extends React.HTMLAttributes<HTMLDivElement> {
  module: React.ReactNode
  count: number
  /** Largura relativa da barra (0–100). */
  widthPct: number
  /** Percentual exibido à direita (string ou número 0–100). */
  percentLabel?: React.ReactNode
  /** Cor de preenchimento da barra. Aceita CSS color ou var(--...) */
  color?: string
  moduleClassName?: string
}

function ParetoBar({
  module,
  count,
  widthPct,
  percentLabel,
  color = "var(--mm-gold)",
  moduleClassName,
  className,
  ...props
}: ParetoBarProps) {
  const clamped = Math.max(0, Math.min(100, widthPct))
  return (
    <div
      data-slot="pareto-bar"
      className={cn("flex items-center gap-2.5 mb-2.5", className)}
      {...props}
    >
      <span
        className={cn(
          "w-[130px] flex-shrink-0 truncate text-[11px] text-[var(--mm-muted)]",
          moduleClassName
        )}
      >
        {module}
      </span>
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${typeof module === 'string' ? module : 'Módulo'}: ${count} (${Math.round(clamped)}%)`}
        className="h-5 flex-1 overflow-hidden rounded bg-[rgba(255,255,255,0.04)]"
      >
        <div
          className="flex h-full items-center rounded pl-2 text-[10px] font-semibold text-black/70"
          style={{ width: `${clamped}%`, background: color }}
        >
          {count}
        </div>
      </div>
      {percentLabel !== undefined && (
        <span className="w-[30px] text-right text-[11px] text-[var(--mm-muted)]">
          {percentLabel}
        </span>
      )}
    </div>
  )
}

export { ParetoBar }
