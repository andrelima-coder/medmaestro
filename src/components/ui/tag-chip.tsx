import * as React from "react"

import { cn } from "@/lib/utils"

interface TagChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "add"
}

function TagChip({
  className,
  variant = "default",
  children,
  ...props
}: TagChipProps) {
  return (
    <span
      data-slot="tag-chip"
      className={cn(
        "mm-chip inline-flex items-center gap-1 rounded-md border bg-[rgba(14,40,65,0.05)] px-2 py-0.5 text-[11px]",
        variant === "default"
          ? "border-[var(--mm-border-default)] text-[var(--mm-muted)]"
          : "mm-press cursor-pointer border-[rgba(212,7,84,0.3)] text-[var(--mm-gold)] hover:bg-[var(--mm-gold-bg)]",
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export { TagChip }
