import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit, getClientIp } from '@/lib/utils/rate-limit'
import {
  issueVerificationCode,
  verifyEmailCode,
  signLeadToken,
} from '@/lib/marketing/lead-verification'

// Confirmação do código de verificação de e-mail do lead (migration 045).
// Consumido pelo formulário hospedado /f/[embedId].
// - { lead_id, code }         → valida o código e carimba email_verified_at
// - { lead_id, resend: true } → reenvia código (rate-limited por lead na lib)

const checkVerifyLimit = rateLimit('public-leads-verify', { max: 20, windowMs: 60_000 })

type VerifyBody = {
  lead_id?: string
  code?: string
  resend?: boolean
}

function cadastroUrl(): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const alunoUrl = (process.env.NEXT_PUBLIC_ALUNO_URL ?? '').replace(/\/$/, '')
  return alunoUrl ? `${alunoUrl}/cadastro` : `${appUrl}/aluno/cadastro`
}

export async function POST(request: Request) {
  let body: VerifyBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body JSON inválido' }, { status: 400 })
  }

  const leadId = body.lead_id?.trim()
  if (!leadId) {
    return NextResponse.json({ ok: false, error: 'lead_id é obrigatório.' }, { status: 400 })
  }

  const limit = checkVerifyLimit(getClientIp(request))
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'Muitas requisições.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    )
  }

  const service = createServiceClient()
  const { data: lead } = await service
    .from('leads')
    .select('id, email, email_verified_at, campaign_id, campaigns(name, access_mode, status)')
    .eq('id', leadId)
    .single()

  if (!lead) {
    return NextResponse.json({ ok: false, error: 'Cadastro não encontrado.' }, { status: 404 })
  }

  const campaignRel = lead.campaigns as unknown as
    | { name: string | null; access_mode: string | null; status: string | null }
    | { name: string | null; access_mode: string | null; status: string | null }[]
    | null
  const campaign = Array.isArray(campaignRel) ? campaignRel[0] : campaignRel

  const next =
    campaign?.status === 'publicada' && campaign?.access_mode === 'imediato'
      ? 'simulado'
      : 'espera'
  const cta = `${cadastroUrl()}?lt=${encodeURIComponent(signLeadToken(leadId))}`

  // Já verificado: idempotente.
  if (lead.email_verified_at) {
    return NextResponse.json({ ok: true, next, cta })
  }

  if (body.resend) {
    const sent = await issueVerificationCode(leadId, lead.email, campaign?.name ?? 'Simulado')
    return sent.ok
      ? NextResponse.json({ ok: true, resent: true })
      : NextResponse.json({ ok: false, error: sent.error }, { status: 429 })
  }

  if (!body.code) {
    return NextResponse.json({ ok: false, error: 'Informe o código.' }, { status: 400 })
  }

  const result = await verifyEmailCode(leadId, body.code)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true, next, cta })
}
