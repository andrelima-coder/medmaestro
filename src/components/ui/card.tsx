import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const cardVariants = cva(
  "relative overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.07)] bg-[var(--mm-card-bg)] backdrop-blur-md transition-[border-color,box-shadow] duration-200 hover:border-[rgba(255,255,255,0.12)] hover:shadow-[0_4px_32px_rgba(0,0,0,0.3)]",
  {
    variants: {
      glow: {
        none: "",
        gold: "glow-gold",
        purple: "glow-purple",
        orange: "glow-orange",
      },
      accent: {
        none: "",
        purple: "card-accent-purple",
      },
    },
    defaultVariants: {
      glow: "none",
      accent: "none",
    },
  }
)

interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

function Card({ className, glow, accent, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ glow, accent }), className)}
      {...props}
    />
  )
}

function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex items-center justify-between gap-3 border-b border-[var(--mm-border-default)] px-5 py-4",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      data-slot="card-title"
      className={cn(
        "font-[family-name:var(--font-syne)] text-sm font-semibold text-foreground",
        className
      )}
      {...props}
    />
  )
}

function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-body"
      className={cn("px-5 py-5", className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardTitle, CardBody, cardVariants }
