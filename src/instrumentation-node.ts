import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const PDFTOPPM = process.env.PDFTOPPM_PATH ?? 'pdftoppm'
const PDFTOTEXT = process.env.PDFTOTEXT_PATH ?? 'pdftotext'

async function probe(bin: string): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  try {
    const { stderr, stdout } = await execFileAsync(bin, ['-v'])
    const version = (stderr || stdout).split('\n')[0].trim()
    return { ok: true, version }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    return { ok: false, error: e.code === 'ENOENT' ? `not found in PATH: ${bin}` : e.message }
  }
}

const requiredEnv = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'WORKER_SECRET',
]
const missingEnv = requiredEnv.filter((k) => !process.env[k])

const [pdftoppm, pdftotext] = await Promise.all([probe(PDFTOPPM), probe(PDFTOTEXT)])

console.log('[startup] MedMaestro boot diagnostic')
console.log(`[startup]   pdftoppm:  ${pdftoppm.ok ? '✓ ' + pdftoppm.version : '✗ ' + pdftoppm.error}`)
console.log(`[startup]   pdftotext: ${pdftotext.ok ? '✓ ' + pdftotext.version : '✗ ' + pdftotext.error}`)
console.log(`[startup]   env vars:  ${missingEnv.length === 0 ? '✓ all set' : '✗ missing: ' + missingEnv.join(', ')}`)
console.log(`[startup]   node:      ${process.version}  platform: ${process.platform}/${process.arch}`)

if (!pdftoppm.ok || !pdftotext.ok) {
  console.warn('[startup] WARNING: PDF tooling missing — extraction pipeline will fail. Install poppler-utils.')
}
if (missingEnv.length > 0) {
  console.warn('[startup] WARNING: missing env vars — dependent features will fail.')
}
