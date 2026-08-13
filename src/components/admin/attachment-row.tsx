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
      className="rounded-md border border-[rgba(211,64,42,0.2)] bg-[rgba(211,64,42,0.1)] px-2.5 py-1 text-[11px] font-medium text-[#D3402A] hover:bg-[rgba(211,64,42,0.2)] disabled:opacity-40 transition-colors"
    >
      {pending ? '…' : 'Excluir'}
    </button>
  )
}
