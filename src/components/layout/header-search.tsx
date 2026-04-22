'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'

export function HeaderSearch() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = inputRef.current?.value.trim()
    if (!q) return
    router.push(`/questoes?q=${encodeURIComponent(q)}`)
  }

  return (
    <form onSubmit={handleSubmit} className="relative hidden lg:flex items-center">
      <Search className="absolute left-2.5 size-3.5 text-muted-foreground/40 pointer-events-none" />
      <input
        ref={inputRef}
        placeholder="Buscar questão…"
        className="h-8 w-48 rounded-lg border border-white/[0.08] bg-white/[0.04] pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
      />
    </form>
  )
}
