// Rate limiter in-memory simples — fixed window com cleanup automático.
// Adequado para single Node process (sem cluster). Se algum dia migrar
// para múltiplos containers, trocar por Redis/Upstash sem mudar callers.
//
// Uso:
//   const limit = rateLimit('login', { max: 5, windowMs: 60_000 })
//   const result = await limit(`ip:${clientIp}`)
//   if (!result.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

type Bucket = {
  count: number
  resetAt: number
}

const stores = new Map<string, Map<string, Bucket>>()

// Cleanup periódico — evita memory leak quando keys variam (ex: IPs distintos)
let cleanupInterval: ReturnType<typeof setInterval> | null = null
function ensureCleanup() {
  if (cleanupInterval) return
  cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const store of stores.values()) {
      for (const [key, bucket] of store.entries()) {
        if (bucket.resetAt <= now) store.delete(key)
      }
    }
  }, 60_000)
  // unref permite o processo terminar mesmo com o timer ativo
  cleanupInterval.unref?.()
}

export type RateLimitOptions = {
  /** Número máximo de requests no window */
  max: number
  /** Tamanho do window em ms */
  windowMs: number
}

export type RateLimitResult = {
  ok: boolean
  remaining: number
  resetAt: number
  retryAfterSec: number
}

export function rateLimit(scope: string, options: RateLimitOptions) {
  ensureCleanup()
  if (!stores.has(scope)) stores.set(scope, new Map())
  const store = stores.get(scope)!

  return function check(key: string): RateLimitResult {
    const now = Date.now()
    const existing = store.get(key)

    if (!existing || existing.resetAt <= now) {
      const bucket: Bucket = { count: 1, resetAt: now + options.windowMs }
      store.set(key, bucket)
      return {
        ok: true,
        remaining: options.max - 1,
        resetAt: bucket.resetAt,
        retryAfterSec: 0,
      }
    }

    if (existing.count >= options.max) {
      return {
        ok: false,
        remaining: 0,
        resetAt: existing.resetAt,
        retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
      }
    }

    existing.count += 1
    return {
      ok: true,
      remaining: options.max - existing.count,
      resetAt: existing.resetAt,
      retryAfterSec: 0,
    }
  }
}

/**
 * Extrai IP confiável da request. Em produção atrás de Nginx, usa
 * X-Forwarded-For (último hop = nginx → confiável). Em dev cai no fallback.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    // Pega o primeiro IP da chain (cliente original)
    return xff.split(',')[0].trim()
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}
