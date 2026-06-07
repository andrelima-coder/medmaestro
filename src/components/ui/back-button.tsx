'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from './button'

interface BackButtonProps {
  /** Rótulo do botão. Padrão: "Voltar". */
  label?: string
  /** Destino opcional. Se omitido, usa o histórico do navegador (router.back). */
  href?: string
  className?: string
}

/**
 * Botão "Voltar" padronizado (design system). Usa ghost variant + seta.
 * Sem `href`, volta no histórico; com `href`, navega para a rota dada.
 */
export function BackButton({ label = 'Voltar', href, className }: BackButtonProps) {
  const router = useRouter()
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => (href ? router.push(href) : router.back())}
    >
      <ArrowLeft />
      {label}
    </Button>
  )
}
