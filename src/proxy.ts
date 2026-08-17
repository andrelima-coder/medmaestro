import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/api/auth/callback',
  // Camada do aluno (feature 001/005): entradas públicas
  '/aluno/login',
  '/aluno/cadastro',
]

// Rotas com auth via WORKER_SECRET (Bearer) ou anônimas — não passam pelo proxy de sessão Supabase
const WORKER_ROUTES = [
  '/api/extract',
  '/api/parse-gabarito',
  '/api/classify',
  '/api/comments',
  '/api/worker',
  '/api/health',
  '/api/admin',
  // Feature aluno: endpoint público de captação (anônimo) + workers da camada do aluno
  '/api/public',
  '/api/analytics',
  '/api/aluno',
  // Formulário de captação hospedado (iframe nas landings) — anônimo
  '/f/',
]

const ADMIN_ROUTES = ['/auditoria', '/configuracoes/usuarios']
const SUPERADMIN_ROUTES = ['/configuracoes/hierarquia', '/configuracoes/tags']
const PROFESSOR_ROUTES = ['/simulados']

// Host do subdomínio do aluno (ex.: aluno.medmaestro.com.br). Quando definido, a
// raiz desse host é reescrita para /aluno (URLs limpas) e o back-office vira 404.
const ALUNO_HOST = process.env.NEXT_PUBLIC_ALUNO_HOST

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1) Roteamento por subdomínio do aluno.
  if (ALUNO_HOST) {
    const host = request.headers.get('host')?.split(':')[0]
    if (host === ALUNO_HOST && !pathname.startsWith('/aluno') && !pathname.startsWith('/api')) {
      const url = request.nextUrl.clone()
      url.pathname = '/aluno' + (pathname === '/' ? '' : pathname)
      return NextResponse.rewrite(url)
    }
  }

  // 2) Worker / endpoints anônimos têm auth própria — sem sessão Supabase.
  if (WORKER_ROUTES.some((r) => pathname.startsWith(r))) {
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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
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

  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r))
  const isAlunoArea = pathname === '/aluno' || pathname.startsWith('/aluno/')

  // Não autenticado: manda para o login correto (aluno x staff).
  if (!user && !isPublic) {
    return NextResponse.redirect(
      new URL(isAlunoArea ? '/aluno/login' : '/login', request.url)
    )
  }

  // Autenticado em telas de entrada: manda para a área certa.
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  if (user && (pathname === '/aluno/login' || pathname === '/aluno/cadastro')) {
    return NextResponse.redirect(new URL('/aluno', request.url))
  }

  if (user) {
    // Cache de role com TTL 60s — D11
    const cachedRole = request.cookies.get('mm-role')?.value
    let role: string

    if (cachedRole) {
      role = cachedRole
    } else {
      const { data } = await supabase
        .from('profiles')
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

    // Guards de papel só valem no back-office (não na área do aluno).
    if (!isAlunoArea) {
      if (SUPERADMIN_ROUTES.some((r) => pathname.startsWith(r)) && role !== 'superadmin') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      if (ADMIN_ROUTES.some((r) => pathname.startsWith(r)) && !['admin', 'superadmin'].includes(role)) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      if (
        PROFESSOR_ROUTES.some((r) => pathname.startsWith(r)) &&
        !['professor', 'admin', 'superadmin'].includes(role)
      ) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
