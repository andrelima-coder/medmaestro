'use client'

import { Search } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useRef, useEffect } from 'react'

export function HeaderSearch() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)

  // Sincroniza o campo com o parâmetro ?q= atual
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = searchParams.get('q') ?? ''
    }
  }, [searchParams])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = inputRef.current?.value.trim()
    if (!q) {
      router.push('/questoes')
      return
    }
    router.push(`/questoes?q=${encodeURIComponent(q)}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      aria-label="Buscar no banco de questões"
      className="relative hidden lg:flex items-center"
    >
      <label htmlFor="header-search-input" className="sr-only">
        Buscar questão
      </label>
      <Search
        aria-hidden
        className="absolute left-2.5 size-3.5 text-muted-foreground/40 pointer-events-none"
      />
      <input
        id="header-search-input"
        ref={inputRef}
        type="search"
        name="q"
        placeholder="Buscar questão…"
        defaultValue={searchParams.get('q') ?? ''}
        className="h-8 w-48 rounded-lg border border-white/[0.08] bg-white/[0.04] pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-[var(--mm-gold)]/40 transition-colors"
      />
    </form>
  )
}
