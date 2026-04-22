import { NextResponse } from 'next/server'
import { processBatch } from '@/lib/queue/worker'

// Registrar handlers de cada fase do pipeline
// (importados à medida que as Sessões 2.2 e 2.3 são implementadas)
// import '@/lib/queue/handlers/extract'
// import '@/lib/queue/handlers/classify'
// import '@/lib/queue/handlers/comments'
// import '@/lib/queue/handlers/generate'

const CONCURRENCY = 5 // D12

/**
 * POST /api/worker/tick
 * Processa um batch de jobs da fila.
 * Protegido por Bearer token — chamar via cron no VPS ou manualmente pelo admin.
 *
 * Cabeçalho: Authorization: Bearer <WORKER_SECRET>
 */
export async function POST(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  const secret = process.env.WORKER_SECRET

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const result = await processBatch(CONCURRENCY)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[worker/tick] erro:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
