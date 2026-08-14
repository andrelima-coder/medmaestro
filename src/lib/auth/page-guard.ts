import { redirect } from 'next/navigation'
import { getAuthedUser, ROLE_RANK, type AppRole, type AuthedUser } from './guards'

/**
 * Guard de PÁGINA (Server Component).
 *
 * Diferente de `requireRole` (que é para Server Actions e devolve um
 * GuardResult para a UI tratar), este redireciona direto — do jeito que as
 * páginas já gateadas do projeto fazem (ex.: leads/page.tsx, analise/page.tsx):
 *  - sem sessão            -> /login
 *  - papel abaixo do mínimo -> /dashboard
 *
 * Fail-closed: `getAuthedUser` devolve o papel do banco (default 'analista'
 * se o profile não carregar), então um perfil ausente nunca ganha acesso admin.
 *
 * Motivação (auditoria): route handlers e várias páginas admin (calibracao,
 * campanhas, analise/campanhas, lotes/[id]) não passam pelo layout de gate e
 * ficavam legíveis por qualquer `analista`. Centralizar aqui evita reescrever
 * o ROLE_RANK inline em cada arquivo.
 */
export async function requireStaffPage(min: AppRole = 'analista'): Promise<AuthedUser> {
  const user = await getAuthedUser()
  if (!user) redirect('/login')
  if ((ROLE_RANK[user.role] ?? -1) < ROLE_RANK[min]) redirect('/dashboard')
  return user
}
