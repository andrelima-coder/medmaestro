import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Bloqueia open redirect: aceita só path interno começando com / e sem
// schema/host/protocol embutido. Rejeita //evil.com, /\\evil.com, javascript:, etc.
function safeNext(raw: string | null): string {
  if (!raw) return '/dashboard'
  if (!raw.startsWith('/')) return '/dashboard'
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/dashboard'
  if (/[\x00-\x1f]/.test(raw)) return '/dashboard'
  if (/^\/?(javascript|data|vbscript):/i.test(raw)) return '/dashboard'
  return raw
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? origin).replace(/\/$/, '')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${baseUrl}${next}`)
    }
  }

  return NextResponse.redirect(`${baseUrl}/login?error=link_invalido`)
}
