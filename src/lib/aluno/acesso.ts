import type { SupabaseClient } from '@supabase/supabase-js'

// Nível de acesso da conta do aluno (porta pública de simulados).
// 'pleno' = matrícula ativa ou conta sem vínculo de lead (comportamento clássico).
// 'lead'  = conta criada a partir de um lead sem matrícula: só a superfície de
//           Simulados, e apenas as campanhas de onde o lead veio.
// Fonte: RPC mt_meu_acesso (SECURITY DEFINER, migration 048).

export type AlunoAcesso = { kind: 'pleno' } | { kind: 'lead'; campaignIds: string[] }

/** Prefixos de rota que uma conta de lead pode acessar dentro de /aluno. */
export const LEAD_ALLOWED_PREFIXES = ['/aluno/simulados', '/aluno/simulado/']

export function leadPodeAcessar(pathname: string): boolean {
  return LEAD_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))
}

export async function getAlunoAcesso(supabase: SupabaseClient): Promise<AlunoAcesso> {
  const { data, error } = await supabase.rpc('mt_meu_acesso')
  if (error || !data) return { kind: 'pleno' }
  const a = data as { kind?: string; campaign_ids?: unknown }
  if (a.kind === 'lead') {
    const ids = Array.isArray(a.campaign_ids)
      ? (a.campaign_ids as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
    return { kind: 'lead', campaignIds: ids }
  }
  return { kind: 'pleno' }
}
