'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runExtractionPipeline } from '@/lib/extraction/pipeline'

export async function triggerExtractionAction(
  examId: string
): Promise<{ ok: boolean; queued?: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: exam, error: examError } = await service
    .from('exams')
    .select('id, source_pdf_path')
    .eq('id', examId)
    .single()

  if (examError || !exam) return { ok: false, error: 'Exame não encontrado' }
  if (!exam.source_pdf_path) return { ok: false, error: 'Exame não possui PDF da prova' }

  await service.from('exams').update({ status: 'extracting' }).eq('id', examId)

  after(async () => {
    await runExtractionPipeline(examId).catch(async () => {
      await createServiceClient().from('exams').update({ status: 'error' }).eq('id', examId)
    })
  })

  return { ok: true, queued: true }
}
