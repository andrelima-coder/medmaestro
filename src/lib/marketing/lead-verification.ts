import { createHash, createHmac, randomInt, timingSafeEqual } from 'crypto'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/lib/utils/rate-limit'

// Verificação de e-mail do lead (gate `campaign_form.require_email_verification`).
// Código de 6 dígitos enviado via Resend; hash sha256 em lead_email_verifications;
// confirmação carimba leads.email_verified_at. Migration 045.

const FROM = 'MedMaestro <noreply@medmaestro.com.br>'
const CODE_TTL_MIN = 15
const MAX_ATTEMPTS = 5

// Reenvio: 3 códigos / 10 min por lead.
const checkSendLimit = rateLimit('lead-verify-send', { max: 3, windowMs: 10 * 60_000 })

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export type VerificationResult = { ok: true } | { ok: false; error: string }

/** Gera e envia um novo código para o lead, invalidando os anteriores. */
export async function issueVerificationCode(
  leadId: string,
  email: string,
  campaignName: string
): Promise<VerificationResult> {
  const limit = checkSendLimit(leadId)
  if (!limit.ok) {
    return {
      ok: false,
      error: `Aguarde ${limit.retryAfterSec}s para pedir um novo código.`,
    }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const service = createServiceClient()

  await service
    .from('lead_email_verifications')
    .delete()
    .eq('lead_id', leadId)
    .is('consumed_at', null)

  const { error: insErr } = await service.from('lead_email_verifications').insert({
    lead_id: leadId,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(),
  })
  if (insErr) return { ok: false, error: 'Falha ao gerar o código. Tente novamente.' }

  const html = `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:420px;margin:0 auto;color:#0E2841">
    <h2 style="font-size:18px">Confirme seu e-mail</h2>
    <p style="font-size:14px;line-height:1.5">Use o código abaixo para confirmar seu cadastro no simulado
    "${campaignName}". Ele vale por ${CODE_TTL_MIN} minutos.</p>
    <p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#D40754;text-align:center;
      background:#FDF2F6;border-radius:12px;padding:16px 0;margin:20px 0">${code}</p>
    <p style="font-size:12px;color:#777;line-height:1.5">Se você não fez este cadastro, ignore este e-mail.<br />
    MedMaestro · medmaestro.com.br</p>
  </div>`

  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: FROM,
      to: email,
      subject: `Seu código: ${code} — ${campaignName}`,
      html,
    })
  } catch (e) {
    console.error('[lead-verification] falha no envio', e)
    return { ok: false, error: 'Não foi possível enviar o e-mail. Tente reenviar.' }
  }

  return { ok: true }
}

/** Confirma o código; em caso de sucesso carimba leads.email_verified_at. */
export async function verifyEmailCode(
  leadId: string,
  code: string
): Promise<VerificationResult> {
  const clean = code.replace(/\D/g, '')
  if (clean.length !== 6) return { ok: false, error: 'Informe o código de 6 dígitos.' }

  const service = createServiceClient()
  const { data: row } = await service
    .from('lead_email_verifications')
    .select('id, code_hash, expires_at, attempts')
    .eq('lead_id', leadId)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row) return { ok: false, error: 'Código expirado. Peça um novo.' }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'Código expirado. Peça um novo.' }
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: 'Muitas tentativas. Peça um novo código.' }
  }

  await service
    .from('lead_email_verifications')
    .update({ attempts: row.attempts + 1 })
    .eq('id', row.id)

  const expected = Buffer.from(row.code_hash, 'hex')
  const got = Buffer.from(hashCode(clean), 'hex')
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return { ok: false, error: 'Código incorreto.' }
  }

  const now = new Date().toISOString()
  await service
    .from('lead_email_verifications')
    .update({ consumed_at: now })
    .eq('id', row.id)
  await service.from('leads').update({ email_verified_at: now }).eq('id', leadId)

  return { ok: true }
}

// ── Token assinado para pré-preencher o cadastro do aluno ───────────────────
// Evita expor lead_id puro na URL (enumeração de PII). Formato: `<leadId>.<hmac>`.

function tokenSecret(): string {
  return process.env.LEAD_LINK_SECRET ?? process.env.WORKER_SECRET ?? ''
}

export function signLeadToken(leadId: string): string {
  const mac = createHmac('sha256', tokenSecret()).update(leadId).digest('hex')
  return `${leadId}.${mac}`
}

export function verifyLeadToken(token: string): string | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const leadId = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  const expected = createHmac('sha256', tokenSecret()).update(leadId).digest('hex')
  if (mac.length !== expected.length) return null
  try {
    if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))) return null
  } catch {
    return null
  }
  return leadId
}
