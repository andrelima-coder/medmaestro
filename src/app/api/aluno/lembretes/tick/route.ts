import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendCampaignReminder } from '@/lib/aluno/lembretes'

// Tick de lembretes (feature 001 — T028). Acionado por cron externo (worker).
// Envia lembrete de abertura (próximo ao window_start) e de live (próximo ao
// live_at) para campanhas publicadas, uma vez cada (dedup em campaign_reminders).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function checkAuth(request: Request): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return false // fail-closed
  return request.headers.get('authorization') === `Bearer ${secret}`
}

const WINDOW_MS = 24 * 60 * 60 * 1000 // antecedência de 24h

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const service = createServiceClient()
  const now = Date.now()
  const horizon = new Date(now + WINDOW_MS).toISOString()
  const nowISO = new Date(now).toISOString()

  const results: Record<string, number> = {}

  // Abertura: campanhas que abrem nas próximas 24h.
  const { data: opening } = await service
    .from('campaigns')
    .select('id')
    .eq('status', 'publicada')
    .not('window_start', 'is', null)
    .gte('window_start', nowISO)
    .lte('window_start', horizon)
  for (const c of opening ?? []) {
    const n = await sendCampaignReminder(c.id, 'abertura')
    if (n >= 0) results[`abertura:${c.id}`] = n
  }

  // Live: campanhas com live nas próximas 24h.
  const { data: live } = await service
    .from('campaigns')
    .select('id')
    .eq('status', 'publicada')
    .not('live_at', 'is', null)
    .gte('live_at', nowISO)
    .lte('live_at', horizon)
  for (const c of live ?? []) {
    const n = await sendCampaignReminder(c.id, 'live')
    if (n >= 0) results[`live:${c.id}`] = n
  }

  return NextResponse.json({ ok: true, sent: results })
}
