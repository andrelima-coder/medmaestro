'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard error]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <p className="text-3xl">⚠️</p>
      <h2 className="text-base font-semibold text-foreground">Algo deu errado</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        {error.message || 'Ocorreu um erro inesperado. Tente novamente.'}
      </p>
      <button
        onClick={reset}
        className="mt-2 h-8 px-4 rounded-lg border border-[rgba(14,40,65,0.12)] bg-[rgba(14,40,65,0.05)] hover:bg-[rgba(14,40,65,0.1)] transition-colors text-xs text-foreground"
      >
        Tentar novamente
      </button>
    </div>
  )
}
