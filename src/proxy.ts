import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password', '/api/auth/callback']

// Rotas com auth via WORKER_SECRET (Bearer) — não devem passar pelo proxy de sessão Supabase
const WORKER_ROUTES = [
  '/api/extract',
  '/api/parse-gabarito',
  '/api/classify',
  '/api/comments',
  '/api/worker',
  '/api/health',
]

const ADMIN_ROUTES = ['/auditoria', '/configuracoes/usuarios']
const SUPERADMIN_ROUTES = ['/configuracoes/hierarquia', '/configuracoes/tags']
const PROFESSOR_ROUTES = ['/simulados']

export async function proxy(request: NextRequest) {
  // Worker routes têm auth Bearer próprio — não exigem cookie de sessão Supabase
  if (WORKER_ROUTES.some((r) => request.nextUrl.pathname.startsWith(r))) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r))

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Cache de role com TTL 60s — D11
  if (user) {
    const cachedRole = request.cookies.get('mm-role')?.value
    let role: string

    if (cachedRole) {
      role = cachedRole
    } else {
      const { data } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      role = (data?.role as string | undefined) ?? 'analista'
      supabaseResponse.cookies.set('mm-role', role, {
        maxAge: 60,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      })
    }

    // Guards por role
    if (SUPERADMIN_ROUTES.some((r) => pathname.startsWith(r)) && role !== 'superadmin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    if (
      ADMIN_ROUTES.some((r) => pathname.startsWith(r)) &&
      !['admin', 'superadmin'].includes(role)
    ) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    if (
      PROFESSOR_ROUTES.some((r) => pathname.startsWith(r)) &&
      !['professor', 'admin', 'superadmin'].includes(role)
    ) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
