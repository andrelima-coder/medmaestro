import { NextResponse, type NextRequest } from 'next/server'

// Roteamento por subdomínio (feature 005 — domínio do aluno).
// Quando a requisição chega pelo host do aluno (NEXT_PUBLIC_ALUNO_HOST, ex.:
// aluno.medmaestro.com.br), a raiz do subdomínio é reescrita para a área /aluno:
//   aluno.medmaestro.com.br/          -> /aluno
//   aluno.medmaestro.com.br/login     -> /aluno/login
//   aluno.medmaestro.com.br/praticar  -> /aluno/praticar
// Assim o candidato usa URLs limpas e o back-office (ex.: /dashboard) vira 404
// nesse host (não é exposto pelo endereço do aluno).
//
// Se NEXT_PUBLIC_ALUNO_HOST não estiver definido, o middleware é inerte
// (desenvolvimento usa o caminho /aluno normalmente).

const ALUNO_HOST = process.env.NEXT_PUBLIC_ALUNO_HOST

export function middleware(req: NextRequest) {
  if (!ALUNO_HOST) return NextResponse.next()

  const host = req.headers.get('host')?.split(':')[0]
  if (host !== ALUNO_HOST) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (pathname === '/aluno' || pathname.startsWith('/aluno/')) {
    return NextResponse.next()
  }

  const url = req.nextUrl.clone()
  url.pathname = '/aluno' + (pathname === '/' ? '' : pathname)
  return NextResponse.rewrite(url)
}

export const config = {
  // Ignora assets, _next e rotas de API (o endpoint público de captação e os
  // workers continuam acessíveis em qualquer host).
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
}
