import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "mm-chip inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap",
  {
    variants: {
      tone: {
        green: "bg-[rgba(0,96,72,0.15)] text-[var(--mm-green)]",
        gold: "bg-[rgba(212,7,84,0.15)] text-[var(--mm-gold)]",
        red: "bg-[rgba(211,64,42,0.15)] text-[var(--mm-red)]",
        blue: "bg-[rgba(32,105,115,0.15)] text-[var(--mm-blue)]",
        muted: "bg-[rgba(14,40,65,0.05)] text-[var(--mm-muted)]",
        orange: "bg-[rgba(242,107,67,0.15)] text-[var(--mm-orange)]",
        purple: "bg-[rgba(123,63,160,0.15)] text-[var(--mm-purple)]",
      },
    },
    defaultVariants: {
      tone: "muted",
    },
  }
)

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
