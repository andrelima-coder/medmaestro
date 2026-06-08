import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Refresh dos agregados de analytics (feature 002 — A008/A010).
// Acionado por cron externo (worker). Fail-closed no WORKER_SECRET.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function checkAuth(request: Request): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const service = createServiceClient()
  const { error } = await service.rpc('recalc_analytics')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
