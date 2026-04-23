import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {}

  // Supabase DB ping
  try {
    const t0 = Date.now()
    const service = createServiceClient()
    const { error } = await service.from('profiles').select('id').limit(1)
    checks.database = { ok: !error, latencyMs: Date.now() - t0, ...(error ? { error: error.message } : {}) }
  } catch (e) {
    checks.database = { ok: false, error: String(e) }
  }

  const allOk = Object.values(checks).every((c) => c.ok)
  const status = allOk ? 200 : 503

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - start,
      checks,
    },
    { status }
  )
}
