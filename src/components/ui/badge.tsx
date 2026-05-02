import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap",
  {
    variants: {
      tone: {
        green: "bg-[rgba(102,187,106,0.15)] text-[var(--mm-green)]",
        gold: "bg-[rgba(201,168,76,0.15)] text-[var(--mm-gold)]",
        red: "bg-[rgba(239,83,80,0.15)] text-[var(--mm-red)]",
        blue: "bg-[rgba(79,195,247,0.15)] text-[var(--mm-blue)]",
        muted: "bg-[rgba(255,255,255,0.05)] text-[var(--mm-muted)]",
        orange: "bg-[rgba(255,107,53,0.15)] text-[var(--mm-orange)]",
        purple: "bg-[rgba(139,92,246,0.15)] text-[var(--mm-purple)]",
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
