import * as React from "react"

import { cn } from "@/lib/utils"

interface YearBarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Valores em % (0–100) para cada ano. */
  values: number[]
  /** Labels do eixo X (ex.: ["2020", ..., "2025"]). Se omitido, sem labels. */
  labels?: string[]
  /** Cor de preenchimento. */
  color?: string
  /** Aplicar opacidade progressiva (0.5 → 1.0) por barra. Default: true. */
  progressiveOpacity?: boolean
}

function YearBarGroup({
  values,
  labels,
  color = "var(--mm-gold)",
  progressiveOpacity = true,
  className,
  ...props
}: YearBarGroupProps) {
  const n = values.length
  return (
    <div data-slot="year-bar-group" className={cn(className)} {...props}>
      <div className="flex h-20 items-end gap-[3px]">
        {values.map((v, i) => {
          const opacity = progressiveOpacity ? 0.5 + (i / Math.max(1, n - 1)) * 0.5 : 1
          const clamped = Math.max(0, Math.min(100, v))
          return (
            <div
              key={i}
              className="flex-1 rounded-t transition-opacity hover:opacity-80"
              style={{
                height: `${clamped}%`,
                background: color,
                opacity,
              }}
            />
          )
        })}
      </div>
      {labels && labels.length > 0 && (
        <div className="mt-1.5 flex">
          {labels.map((l, i) => (
            <span
              key={i}
              className="flex-1 text-center text-[10px] text-[var(--mm-muted)]"
            >
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export { YearBarGroup }
