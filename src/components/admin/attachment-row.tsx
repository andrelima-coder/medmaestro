'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteQuestionAttachment } from '@/app/(dashboard)/revisao/[id]/attachment-actions'

export function AttachmentRow({ attachmentId }: { attachmentId: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleDelete() {
    if (!confirm('Excluir definitivamente este anexo? Esta ação não pode ser desfeita.')) return
    startTransition(async () => {
      const res = await deleteQuestionAttachment(attachmentId)
      if (res.ok) router.refresh()
      else alert(res.error ?? 'Falha ao excluir')
    })
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
    >
      {pending ? '…' : 'Excluir'}
    </button>
  )
}
