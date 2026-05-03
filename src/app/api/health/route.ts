import { NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const execFileAsync = promisify(execFile)

type Check = { ok: boolean; latencyMs?: number; error?: string; info?: string }

async function probeBinary(bin: string): Promise<Check> {
  const t0 = Date.now()
  try {
    const { stderr, stdout } = await execFileAsync(bin, ['-v'])
    const version = (stderr || stdout).split('\n')[0].trim()
    return { ok: true, latencyMs: Date.now() - t0, info: version }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: e.code === 'ENOENT' ? `not found in PATH (${bin})` : e.message,
    }
  }
}

async function probeDatabase(): Promise<Check> {
  const t0 = Date.now()
  try {
    const service = createServiceClient()
    const { error } = await service.from('profiles').select('id').limit(1)
    return error
      ? { ok: false, latencyMs: Date.now() - t0, error: error.message }
      : { ok: true, latencyMs: Date.now() - t0 }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

async function probeStorage(): Promise<Check> {
  const t0 = Date.now()
  try {
    const service = createServiceClient()
    const { data, error } = await service.storage.listBuckets()
    if (error) return { ok: false, latencyMs: Date.now() - t0, error: error.message }
    const expected = ['exam-pdfs', 'question-images', 'comment-images', 'exports', 'question-attachments']
    const found = (data ?? []).map((b) => b.name)
    const missing = expected.filter((b) => !found.includes(b))
    return missing.length === 0
      ? { ok: true, latencyMs: Date.now() - t0, info: `${found.length} buckets` }
      : { ok: false, latencyMs: Date.now() - t0, error: `missing buckets: ${missing.join(', ')}` }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

async function probeClaude(): Promise<Check> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'ANTHROPIC_API_KEY not set' }
  }
  const t0 = Date.now()
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(5000),
    })
    return r.ok
      ? { ok: true, latencyMs: Date.now() - t0 }
      : { ok: false, latencyMs: Date.now() - t0, error: `HTTP ${r.status}` }
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, error: String(e) }
  }
}

function probeEnv(): Check {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANTHROPIC_API_KEY',
    'WORKER_SECRET',
  ]
  const missing = required.filter((k) => !process.env[k])
  return missing.length === 0
    ? { ok: true, info: `${required.length} required vars set` }
    : { ok: false, error: `missing: ${missing.join(', ')}` }
}

export async function GET() {
  const start = Date.now()

  const [database, storage, claude, pdftoppm, pdftotext] = await Promise.all([
    probeDatabase(),
    probeStorage(),
    probeClaude(),
    probeBinary(process.env.PDFTOPPM_PATH ?? 'pdftoppm'),
    probeBinary(process.env.PDFTOTEXT_PATH ?? 'pdftotext'),
  ])
  const env = probeEnv()

  const checks = { env, database, storage, claude, pdftoppm, pdftotext }
  const allOk = Object.values(checks).every((c) => c.ok)

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - start,
      runtime: {
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
      },
      checks,
    },
    { status: allOk ? 200 : 503 }
  )
}
