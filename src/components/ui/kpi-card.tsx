import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Info } from "lucide-react"

import { cn } from "@/lib/utils"

const kpiCardVariants = cva(
  "relative overflow-hidden rounded-[14px] border border-[rgba(14,40,65,0.07)] bg-[var(--mm-card-bg)] px-5 py-[18px] backdrop-blur-md transition-all duration-[250ms] hover:-translate-y-px before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(14,40,65,0.08),transparent)]",
  {
    variants: {
      tone: {
        neutral: "hover:border-[rgba(14,40,65,0.14)]",
        total:
          "hover:border-[rgba(123,63,160,0.35)] hover:shadow-[0_8px_32px_rgba(123,63,160,0.15)]",
        ok:
          "hover:border-[rgba(0,96,72,0.35)] hover:shadow-[0_8px_32px_rgba(0,96,72,0.12)]",
        pending:
          "hover:border-[rgba(212,7,84,0.35)] hover:shadow-[0_8px_32px_rgba(212,7,84,0.12)]",
        info:
          "hover:border-[rgba(32,105,115,0.35)] hover:shadow-[0_8px_32px_rgba(32,105,115,0.12)]",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
)

const labelToneClass: Record<NonNullable<KpiTone>, string> = {
  neutral: "text-[var(--mm-muted)]",
  total: "text-[rgba(123,63,160,0.7)]",
  ok: "text-[rgba(0,96,72,0.7)]",
  pending: "text-[rgba(212,7,84,0.7)]",
  info: "text-[rgba(32,105,115,0.7)]",
}

type KpiTone = "neutral" | "total" | "ok" | "pending" | "info"

type KpiDeltaDirection = "up" | "down" | "neutral"

interface KpiCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof kpiCardVariants> {
  label: React.ReactNode
  value: React.ReactNode
  icon?: React.ReactNode
  delta?: {
    direction?: KpiDeltaDirection
    text: React.ReactNode
  }
  valueClassName?: string
  /** Texto explicativo exibido no hover de um ícone (i) ao lado do label. */
  info?: string
}

function KpiCard({
  className,
  tone = "neutral",
  label,
  value,
  icon,
  delta,
  valueClassName,
  info,
  ...props
}: KpiCardProps) {
  const deltaDir = delta?.direction ?? "neutral"
  const deltaArrow = deltaDir === "up" ? "↗" : deltaDir === "down" ? "↘" : "→"
  const deltaColor =
    deltaDir === "up"
      ? "text-[var(--mm-green)]"
      : deltaDir === "down"
        ? "text-[var(--mm-red)]"
        : "text-[var(--mm-muted)]"

  return (
    <div
      data-slot="kpi-card"
      className={cn(kpiCardVariants({ tone }), className)}
      {...props}
    >
      <div
        className={cn(
          "mb-2.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em]",
          labelToneClass[tone ?? "neutral"]
        )}
      >
        {icon}
        {label}
        {info && (
          <button
            type="button"
            title={info}
            aria-label={info}
            className="ml-auto cursor-help text-current opacity-50 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none"
          >
            <Info className="size-3" />
          </button>
        )}
      </div>
      <div
        className={cn(
          "mb-1.5 font-[family-name:var(--font-syne)] text-[28px] font-bold leading-tight text-foreground",
          valueClassName
        )}
      >
        {value}
      </div>
      {delta && (
        <div className={cn("flex items-center gap-1 text-xs", deltaColor)}>
          <span aria-hidden>{deltaArrow}</span>
          <span>{delta.text}</span>
        </div>
      )}
    </div>
  )
}

export { KpiCard, kpiCardVariants }
export type { KpiCardProps, KpiTone, KpiDeltaDirection }
