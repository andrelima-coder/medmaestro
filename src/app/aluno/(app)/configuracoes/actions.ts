'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

type ActionResult = { ok: boolean; error?: string }

/** Atualiza o nome de exibição do aluno (profiles.full_name). */
export async function salvarPerfilAlunoAction(nome: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado.' }

  const limpo = nome.trim().replace(/\s+/g, ' ')
  if (limpo.length < 2 || limpo.length > 120) {
    return { ok: false, error: 'O nome precisa ter entre 2 e 120 caracteres.' }
  }

  const service = createServiceClient()
  const { error } = await service.from('profiles').update({ full_name: limpo }).eq('id', user.id)
  if (error) return { ok: false, error: 'Falha ao salvar o perfil.' }

  await logAudit(user.id, 'user', user.id, 'profile_updated', null, { full_name: limpo })
  revalidatePath('/aluno')
  revalidatePath('/aluno/configuracoes')
  return { ok: true }
}

/** Preferências do timer de Foco (mt_preferencias, RLS own-row). */
export async function salvarPomodoroAction(
  focoMin: number,
  pausaCurtaMin: number,
  pausaLongaMin: number
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado.' }

  const foco = Math.round(focoMin)
  const curta = Math.round(pausaCurtaMin)
  const longa = Math.round(pausaLongaMin)
  if (!Number.isFinite(foco) || foco < 5 || foco > 180) {
    return { ok: false, error: 'Foco deve ficar entre 5 e 180 minutos.' }
  }
  if (!Number.isFinite(curta) || curta < 1 || curta > 60) {
    return { ok: false, error: 'Pausa curta deve ficar entre 1 e 60 minutos.' }
  }
  if (!Number.isFinite(longa) || longa < 5 || longa > 120) {
    return { ok: false, error: 'Pausa longa deve ficar entre 5 e 120 minutos.' }
  }

  const { error } = await supabase
    .from('mt_preferencias')
    .upsert({ user_id: user.id, foco_min: foco, pausa_curta_min: curta, pausa_longa_min: longa })
  if (error) return { ok: false, error: 'Falha ao salvar: ' + error.message }

  revalidatePath('/aluno/foco')
  revalidatePath('/aluno/configuracoes')
  return { ok: true }
}

/** Troca de senha do aluno — reautentica com a senha atual antes de trocar. */
export async function alterarSenhaAlunoAction(
  senhaAtual: string,
  novaSenha: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) return { ok: false, error: 'Não autenticado.' }

  if (novaSenha.length < 8) return { ok: false, error: 'Nova senha precisa ter ao menos 8 caracteres.' }
  if (novaSenha === senhaAtual) return { ok: false, error: 'Nova senha deve ser diferente da atual.' }

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: senhaAtual,
  })
  if (signInErr) return { ok: false, error: 'Senha atual incorreta.' }

  const { error: updErr } = await supabase.auth.updateUser({ password: novaSenha })
  if (updErr) return { ok: false, error: updErr.message }

  await logAudit(user.id, 'user', user.id, 'password_changed', null, null)
  return { ok: true }
}
