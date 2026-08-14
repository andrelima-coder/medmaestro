'use client'

import { useState } from 'react'
import { deleteExamAction } from '@/app/(dashboard)/(admin)/lotes/actions'

/**
 * Botão "Excluir" para lotes com erro / abandonados.
 * Exige dupla confirmação (a segunda mostra o nº de questões que serão
 * apagadas) — a exclusão é definitiva: questões, figuras, gabarito e PDFs.
 */
export function DeleteLoteButton({
  examId,
  label,
  questionCount,
}: {
  examId: string
  label: string
  questionCount: number
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleClick() {
    if (state === 'loading') return
    const msg =
      questionCount > 0
        ? `Excluir DEFINITIVAMENTE o lote "${label}"?\n\nIsso apaga ${questionCount} questão(ões), figuras, gabarito e os PDFs do caderno. Não há como desfazer.`
        : `Excluir DEFINITIVAMENTE o lote "${label}"?\n\nOs PDFs enviados também serão removidos. Não há como desfazer.`
    if (!window.confirm(msg)) return

    setState('loading')
    setErrorMsg(null)
    const res = await deleteExamAction(examId)
    if (res.ok) {
      window.location.reload()
    } else {
      setState('error')
      setErrorMsg(res.error ?? 'Falha ao excluir')
      window.alert(`Não foi possível excluir: ${res.error ?? 'erro desconhecido'}`)
      setTimeout(() => setState('idle'), 2000)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      title={errorMsg ?? 'Excluir lote definitivamente'}
      style={{
        fontSize: 11,
        color: '#D3402A',
        border: '1px solid rgba(211,64,42,0.3)',
        borderRadius: 6,
        padding: '4px 10px',
        fontWeight: 600,
        background: 'rgba(211,64,42,0.08)',
        cursor: state === 'loading' ? 'default' : 'pointer',
        transition: 'all 0.15s',
        opacity: state === 'loading' ? 0.6 : 1,
      }}
    >
      {state === 'loading' ? 'Excluindo…' : 'Excluir'}
    </button>
  )
}
