import * as React from "react"
import { Lock } from "lucide-react"

import { cn } from "@/lib/utils"

interface LockBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
}

function LockBanner({
  className,
  icon,
  children,
  ...props
}: LockBannerProps) {
  return (
    <div
      data-slot="lock-banner"
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-lg border border-[rgba(79,195,247,0.20)] bg-[rgba(79,195,247,0.08)] px-3.5 py-2 text-xs text-[var(--mm-info)]",
        className
      )}
      {...props}
    >
      <span aria-hidden>{icon ?? <Lock className="size-3.5" />}</span>
      <div>{children}</div>
    </div>
  )
}

export { LockBanner }
