'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Agenda pessoal + anotações (portado do mentortemi-web, mesmo schema
// mt_agenda_blocos/mt_anotacoes — feature de mentoria, exige matrícula
// checada na página; aqui só a autenticação é reconfirmada).

async function getAuthedUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export type CreateBlocoInput = {
  titulo: string
  diaSemana: number
  horaInicio: string
  horaFim: string
  cor: number
}

export async function createBlocoAction(
  input: CreateBlocoInput
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getAuthedUserId()
  if (!userId) return { ok: false, error: 'Não autenticado.' }

  const titulo = input.titulo.trim()
  if (!titulo) return { ok: false, error: 'Título é obrigatório.' }
  if (input.diaSemana < 0 || input.diaSemana > 6) return { ok: false, error: 'Dia inválido.' }
  if (!input.horaInicio || !input.horaFim || input.horaFim <= input.horaInicio) {
    return { ok: false, error: 'O horário final precisa ser depois do inicial.' }
  }

  const service = createServiceClient()
  const { error } = await service.from('mt_agenda_blocos').insert({
    user_id: userId,
    titulo,
    dia_semana: input.diaSemana,
    hora_inicio: input.horaInicio,
    hora_fim: input.horaFim,
    cor: input.cor,
  })
  if (error) return { ok: false, error: 'Falha ao salvar: ' + error.message }

  revalidatePath('/aluno/agenda')
  return { ok: true }
}

export async function deleteBlocoAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await getAuthedUserId()
  if (!userId) return { ok: false, error: 'Não autenticado.' }

  const service = createServiceClient()
  const { error } = await service
    .from('mt_agenda_blocos')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) return { ok: false, error: 'Falha ao remover: ' + error.message }

  revalidatePath('/aluno/agenda')
  return { ok: true }
}

export async function createNotaAction(texto: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await getAuthedUserId()
  if (!userId) return { ok: false, error: 'Não autenticado.' }

  const limpo = texto.trim()
  if (!limpo) return { ok: false, error: 'Escreva algo antes de salvar.' }

  const service = createServiceClient()
  const { error } = await service.from('mt_anotacoes').insert({ user_id: userId, texto: limpo })
  if (error) return { ok: false, error: 'Falha ao salvar: ' + error.message }

  revalidatePath('/aluno/agenda')
  return { ok: true }
}

export async function deleteNotaAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await getAuthedUserId()
  if (!userId) return { ok: false, error: 'Não autenticado.' }

  const service = createServiceClient()
  const { error } = await service.from('mt_anotacoes').delete().eq('id', id).eq('user_id', userId)
  if (error) return { ok: false, error: 'Falha ao remover: ' + error.message }

  revalidatePath('/aluno/agenda')
  return { ok: true }
}
