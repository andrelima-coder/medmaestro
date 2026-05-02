import * as React from "react"

import { cn } from "@/lib/utils"

interface LiveBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode
}

function LiveBadge({ className, children, ...props }: LiveBadgeProps) {
  return (
    <span
      data-slot="live-badge"
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,107,53,0.30)] bg-[rgba(255,107,53,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[var(--mm-orange)]",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-[var(--mm-orange)] animate-[pulse-orange_1.8s_ease-in-out_infinite]"
      />
      <span className="sr-only">Em andamento:</span>
      {children}
    </span>
  )
}

export { LiveBadge }
