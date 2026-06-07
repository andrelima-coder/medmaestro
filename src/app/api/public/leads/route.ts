import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/lib/utils/rate-limit'

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
  const whatsapp = body.whatsapp?.trim()

  if (!embedId || !email || !name || !whatsapp) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: embed_id, name, email, whatsapp.' },
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
    .select('campaign_id, allowed_domains')
    .eq('embed_id', embedId)
    .single()

  if (!form) {
    return NextResponse.json({ error: 'Formulário não encontrado.' }, { status: 404 })
  }

  // Allowlist de domínio (quando configurada).
  const allowed: string[] = form.allowed_domains ?? []
  if (allowed.length > 0) {
    const host = originHost(request)
    if (!host || !allowed.includes(host)) {
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
  }

  // Próximo passo conforme o modo de acesso da campanha.
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('access_mode, status')
    .eq('id', form.campaign_id)
    .single()

  const next =
    campaign?.status === 'publicada' && campaign?.access_mode === 'imediato'
      ? 'simulado'
      : 'espera'

  return NextResponse.json({ lead_id: leadId, next }, { status: created ? 201 : 200 })
}
