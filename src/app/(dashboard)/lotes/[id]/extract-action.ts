'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function triggerExtractionAction(
  examId: string
): Promise<{ ok: boolean; queued?: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const workerSecret = process.env.WORKER_SECRET ?? ''
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  try {
    const res = await fetch(`${baseUrl}/api/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workerSecret && { Authorization: `Bearer ${workerSecret}` }),
      },
      body: JSON.stringify({ exam_id: examId }),
    })
    const data = (await res.json()) as { ok: boolean; queued?: boolean; error?: string }
    return data
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
