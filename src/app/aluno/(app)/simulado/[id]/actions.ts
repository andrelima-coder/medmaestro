'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendConversionEvent, findLeadIdByUserEmail } from '@/lib/marketing/conversao'
import { logAudit } from '@/lib/audit'

// Runtime do simulado (feature 001 — T017/T018/T020).
// Cronômetro autoritativo no servidor (coluna deadline_at). O cliente apenas
// reflete; toda decisão de tempo é validada aqui.

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function currentAlunoId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

function remainingFrom(attempt: {
  status: string
  time_remaining: number
  deadline_at: string | null
}): number {
  if (attempt.status !== 'em_andamento') return 0
  if (!attempt.deadline_at) return Math.max(0, attempt.time_remaining) // pausado
  return Math.max(0, Math.floor((new Date(attempt.deadline_at).getTime() - Date.now()) / 1000))
}

/** Inicia ou retoma a tentativa do aluno para a campanha. */
export async function startOrResumeAttempt(
  campaignId: string
): Promise<ActionResult<{ attemptId: string; remaining: number; status: string }>> {
  const userId = await currentAlunoId()
  if (!userId) return { ok: false, error: 'Não autenticado.' }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, status, duration_minutes, access_mode, window_start, window_end, pause_allowed')
    .eq('id', campaignId)
    .single()

  if (!campaign || campaign.status !== 'publicada') {
    return { ok: false, error: 'Campanha indisponível.' }
  }

  // Checagem de janela de acesso.
  const now = Date.now()
  if (campaign.access_mode !== 'imediato') {
    if (campaign.window_start && now < new Date(campaign.window_start).getTime())
      return { ok: false, error: 'A prova ainda não está liberada.' }
    if (campaign.window_end && now > new Date(campaign.window_end).getTime())
      return { ok: false, error: 'A janela desta prova foi encerrada.' }
  }

  const { data: existing } = await service
    .from('simulado_attempts')
    .select('id, status, time_remaining, deadline_at')
    .eq('user_id', userId)
    .eq('campaign_id', campaignId)
    .maybeSingle()

  // Tentativa única: já entregue/expirada não refaz.
  if (existing && existing.status !== 'em_andamento') {
    return { ok: false, error: 'Você já realizou esta prova.' }
  }

  if (existing) {
    // Retoma: se estava pausada, religa o relógio.
    let remaining = remainingFrom(existing)
    if (!existing.deadline_at) {
      const deadline = new Date(Date.now() + remaining * 1000).toISOString()
      await service.from('simulado_attempts').update({ deadline_at: deadline }).eq('id', existing.id)
    } else if (remaining <= 0) {
      await service
        .from('simulado_attempts')
        .update({ status: 'expirado', time_remaining: 0 })
        .eq('id', existing.id)
      return { ok: false, error: 'O tempo desta prova já terminou.' }
    }
    return { ok: true, data: { attemptId: existing.id, remaining, status: 'em_andamento' } }
  }

  // Nova tentativa.
  const totalSeconds = campaign.duration_minutes * 60
  const deadline = new Date(Date.now() + totalSeconds * 1000).toISOString()
  const { data: created, error } = await service
    .from('simulado_attempts')
    .insert({
      user_id: userId,
      campaign_id: campaignId,
      time_remaining: totalSeconds,
      deadline_at: deadline,
      status: 'em_andamento',
    })
    .select('id')
    .single()

  if (error || !created) return { ok: false, error: 'Falha ao iniciar a prova.' }
  return { ok: true, data: { attemptId: created.id, remaining: totalSeconds, status: 'em_andamento' } }
}

/** Salva (trava) a resposta de uma questão. Não revela correção. */
export async function saveAnswer(
  attemptId: string,
  questionId: string,
  selectedAlt: string
): Promise<ActionResult<{ remaining: number }>> {
  const userId = await currentAlunoId()
  if (!userId) return { ok: false, error: 'Não autenticado.' }
  if (!['A', 'B', 'C', 'D', 'E'].includes(selectedAlt))
    return { ok: false, error: 'Alternativa inválida.' }

  const service = createServiceClient()
  const { data: attempt } = await service
    .from('simulado_attempts')
    .select('id, user_id, status, time_remaining, deadline_at')
    .eq('id', attemptId)
    .single()

  if (!attempt || attempt.user_id !== userId)
    return { ok: false, error: 'Tentativa inválida.' }
  if (attempt.status !== 'em_andamento')
    return { ok: false, error: 'Prova encerrada.' }

  const remaining = remainingFrom(attempt)
  if (remaining <= 0) {
    await service.from('simulado_attempts').update({ status: 'expirado', time_remaining: 0 }).eq('id', attemptId)
    return { ok: false, error: 'Tempo esgotado.' }
  }

  // Não permite alterar resposta já salva.
  const { data: prev } = await service
    .from('question_attempts')
    .select('id, is_saved')
    .eq('attempt_id', attemptId)
    .eq('question_id', questionId)
    .maybeSingle()

  if (prev?.is_saved) return { ok: false, error: 'Resposta já salva e travada.' }

  if (prev) {
    await service
      .from('question_attempts')
      .update({ selected_alt: selectedAlt, is_saved: true })
      .eq('id', prev.id)
  } else {
    await service.from('question_attempts').insert({
      attempt_id: attemptId,
      question_id: questionId,
      selected_alt: selectedAlt,
      is_saved: true,
    })
  }

  return { ok: true, data: { remaining } }
}

/** Pausa (se permitido pela campanha): persiste o saldo e desliga o relógio. */
export async function pauseAttempt(attemptId: string): Promise<ActionResult<{ remaining: number }>> {
  const userId = await currentAlunoId()
  if (!userId) return { ok: false, error: 'Não autenticado.' }

  const service = createServiceClient()
  const { data: attempt } = await service
    .from('simulado_attempts')
    .select('id, user_id, status, time_remaining, deadline_at, campaign_id')
    .eq('id', attemptId)
    .single()
  if (!attempt || attempt.user_id !== userId) return { ok: false, error: 'Tentativa inválida.' }

  const { data: campaign } = await service
    .from('campaigns')
    .select('pause_allowed')
    .eq('id', attempt.campaign_id)
    .single()
  if (!campaign?.pause_allowed) return { ok: false, error: 'Pausa não permitida nesta prova.' }

  const remaining = remainingFrom(attempt)
  await service
    .from('simulado_attempts')
    .update({ time_remaining: remaining, deadline_at: null, was_paused: true })
    .eq('id', attemptId)
  return { ok: true, data: { remaining } }
}

/** Sincroniza o tempo com o servidor; encerra automaticamente se expirou. */
export async function syncTime(
  attemptId: string
): Promise<ActionResult<{ remaining: number; status: string }>> {
  const userId = await currentAlunoId()
  if (!userId) return { ok: false, error: 'Não autenticado.' }

  const service = createServiceClient()
  const { data: attempt } = await service
    .from('simulado_attempts')
    .select('id, user_id, status, time_remaining, deadline_at')
    .eq('id', attemptId)
    .single()
  if (!attempt || attempt.user_id !== userId) return { ok: false, error: 'Tentativa inválida.' }

  const remaining = remainingFrom(attempt)
  if (attempt.status === 'em_andamento' && attempt.deadline_at && remaining <= 0) {
    await service
      .from('simulado_attempts')
      .update({ status: 'expirado', time_remaining: 0 })
      .eq('id', attemptId)
    return { ok: true, data: { remaining: 0, status: 'expirado' } }
  }
  return { ok: true, data: { remaining, status: attempt.status } }
}

/** Entrega a prova (parcial se não concluiu). Resultado/gating ficam em T021. */
export async function submitAttempt(attemptId: string): Promise<ActionResult<{ status: string }>> {
  const userId = await currentAlunoId()
  if (!userId) return { ok: false, error: 'Não autenticado.' }

  const service = createServiceClient()
  const { data: attempt } = await service
    .from('simulado_attempts')
    .select('id, user_id, campaign_id, status, time_remaining, deadline_at')
    .eq('id', attemptId)
    .single()
  if (!attempt || attempt.user_id !== userId) return { ok: false, error: 'Tentativa inválida.' }
  if (attempt.status !== 'em_andamento') return { ok: true, data: { status: attempt.status } }

  const remaining = remainingFrom(attempt)
  await service
    .from('simulado_attempts')
    .update({ status: 'entregue', time_remaining: remaining, deadline_at: null })
    .eq('id', attemptId)

  // Telemetria: registra a entrega (T031).
  await logAudit(userId, 'attempt', attemptId, 'attempt_submitted', null, {
    campaign_id: attempt.campaign_id,
    remaining,
  })

  // Conversão: simulado_concluido (pós-resposta, best-effort).
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const email = user?.email
  if (email) {
    after(async () => {
      const leadId = await findLeadIdByUserEmail(attempt.campaign_id, email)
      if (leadId) await sendConversionEvent(leadId, 'simulado_concluido')
    })
  }

  return { ok: true, data: { status: 'entregue' } }
}

/** Reporta um possível erro na questão; vira sinalização para a curadoria (T019). */
export async function reportarErro(
  questionId: string,
  motivo: string
): Promise<ActionResult<null>> {
  const userId = await currentAlunoId()
  if (!userId) return { ok: false, error: 'Não autenticado.' }
  const service = createServiceClient()
  const { error } = await service.from('gabarito_flags').insert({
    question_id: questionId,
    reason: `reporte_aluno: ${motivo?.trim() || 'sem detalhe'}`,
    status: 'aberto',
  })
  if (error) return { ok: false, error: 'Não foi possível enviar o reporte.' }
  return { ok: true, data: null }
}

/** Envia uma dúvida sobre uma questão, agregada para a live (T023). */
export async function saveDoubt(
  campaignId: string,
  questionId: string,
  text: string
): Promise<ActionResult<null>> {
  const userId = await currentAlunoId()
  if (!userId) return { ok: false, error: 'Não autenticado.' }
  const clean = text?.trim()
  if (!clean) return { ok: false, error: 'Escreva sua dúvida.' }

  const service = createServiceClient()
  const { error } = await service.from('question_doubts').insert({
    question_id: questionId,
    user_id: userId,
    campaign_id: campaignId,
    text: clean,
  })
  if (error) return { ok: false, error: 'Não foi possível enviar a dúvida.' }
  return { ok: true, data: null }
}
