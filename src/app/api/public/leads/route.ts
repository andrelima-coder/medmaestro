import { NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/lib/utils/rate-limit'
import { sendConversionEvent } from '@/lib/marketing/conversao'
import { normalizeWhatsapp } from '@/lib/utils/whatsapp'
import { issueVerificationCode } from '@/lib/marketing/lead-verification'

// Endpoint público de captação de lead (feature 001 — T014).
// Contrato: _reversa_forward/001-camada-aluno-simulados/interfaces/embed-lead-capture.md
// Consumido pelo formulário embedável em landing pages de terceiros.
// Anônimo, mas protegido por allowlist de domínio, honeypot e rate limit.
// Usa service-role (ignora RLS) para gravar lead + consentimento.

const checkLeadLimit = rateLimit('public-leads', { max: 10, windowMs: 60_000 })

type LeadBody = {
  embed_id?: string
  email?: string
  name?: string
  whatsapp?: string
  fields?: Record<string, unknown>
  consent?: boolean
  consent_version?: string
  hp?: string // honeypot — deve vir vazio
}

function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() ?? 'unknown'
}

function originHost(request: Request): string | null {
  const origin = request.headers.get('origin') ?? request.headers.get('referer')
  if (!origin) return null
  try {
    return new URL(origin).host
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  let body: LeadBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  // Honeypot: bot preencheu campo oculto -> descarta silenciosamente (200 controlado).
  if (body.hp && body.hp.trim() !== '') {
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const embedId = body.embed_id?.trim()
  const email = body.email?.trim().toLowerCase()
  const name = body.name?.trim()
  const whatsappRaw = body.whatsapp?.trim()

  if (!embedId || !email || !name || !whatsappRaw) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: embed_id, name, email, whatsapp.' },
      { status: 400 }
    )
  }

  // Formato do e-mail: sem isso a rota grava lead lixo (ex.: "nao-e-um-email"),
  // e o código de verificação seria emitido para um endereço inentregável.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return NextResponse.json(
      { error: 'E-mail inválido. Confira o endereço informado.' },
      { status: 400 }
    )
  }

  // Normaliza para E.164 (+55DD9XXXXXXXX); rejeita número que não é celular BR.
  const whatsapp = normalizeWhatsapp(whatsappRaw)
  if (!whatsapp) {
    return NextResponse.json(
      { error: 'WhatsApp inválido. Informe DDD + celular, ex.: (11) 91234-5678.' },
      { status: 400 }
    )
  }
  if (body.consent !== true || !body.consent_version) {
    return NextResponse.json(
      { error: 'Consentimento LGPD é obrigatório.' },
      { status: 400 }
    )
  }

  // Rate limit por IP.
  const limit = checkLeadLimit(clientIp(request))
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Muitas requisições.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    )
  }

  const supabase = createServiceClient()

  // Resolve a campanha pelo embed_id.
  const { data: form } = await supabase
    .from('campaign_form')
    .select('campaign_id, allowed_domains, require_email_verification')
    .eq('embed_id', embedId)
    .single()

  if (!form) {
    return NextResponse.json({ error: 'Formulário não encontrado.' }, { status: 404 })
  }

  // Allowlist de domínio (quando configurada). O formulário hospedado (/f/…)
  // envia com Origin do próprio app — sempre permitido; nele a proteção contra
  // embed indevido é o CSP frame-ancestors.
  const allowed: string[] = form.allowed_domains ?? []
  if (allowed.length > 0) {
    const host = originHost(request)
    const selfHost = new URL(request.url).host
    if (!host || (host !== selfHost && !allowed.includes(host))) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 })
    }
  }

  // Monta os campos capturados (mínimos + customizados).
  const fields = { name, whatsapp, ...(body.fields ?? {}) }

  // Insere o lead; dedup por (campaign_id, email).
  const { data: inserted, error: insErr } = await supabase
    .from('leads')
    .insert({ campaign_id: form.campaign_id, email, fields, origin: originHost(request) })
    .select('id')
    .single()

  let leadId = inserted?.id
  let created = true

  if (insErr) {
    // 23505 = unique_violation -> lead já existe nesta campanha; retorna o existente.
    if (insErr.code === '23505') {
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('campaign_id', form.campaign_id)
        .eq('email', email)
        .single()
      leadId = existing?.id
      created = false
    } else {
      return NextResponse.json({ error: 'Falha ao registrar lead.' }, { status: 500 })
    }
  }

  if (!leadId) {
    return NextResponse.json({ error: 'Falha ao registrar lead.' }, { status: 500 })
  }

  // Grava o consentimento versionado/carimbado (apenas em criação nova).
  if (created) {
    await supabase.from('lead_consents').insert({
      lead_id: leadId,
      consent_version: body.consent_version,
      origin_url: request.headers.get('referer') ?? request.headers.get('origin'),
    })
    // Conversão: lead_cadastrado (pós-resposta, não bloqueia).
    after(() => sendConversionEvent(leadId!, 'lead_cadastrado'))
  }

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('name, access_mode, status')
    .eq('id', form.campaign_id)
    .single()

  // Gate de verificação de e-mail: enquanto o lead não confirmar o código,
  // o próximo passo é sempre 'verificar' (fluxo em /api/public/leads/verify).
  if (form.require_email_verification) {
    const { data: leadRow } = await supabase
      .from('leads')
      .select('email_verified_at')
      .eq('id', leadId)
      .single()
    if (!leadRow?.email_verified_at) {
      const sent = await issueVerificationCode(leadId, email, campaign?.name ?? 'Simulado')
      return NextResponse.json(
        {
          lead_id: leadId,
          next: 'verificar',
          ...(sent.ok ? {} : { warning: sent.error }),
        },
        { status: created ? 201 : 200 }
      )
    }
  }

  // Próximo passo conforme o modo de acesso da campanha.
  const next =
    campaign?.status === 'publicada' && campaign?.access_mode === 'imediato'
      ? 'simulado'
      : 'espera'

  return NextResponse.json({ lead_id: leadId, next }, { status: created ? 201 : 200 })
}
