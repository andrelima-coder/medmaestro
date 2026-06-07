import { createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'

// Eventos de conversão por campanha (feature 001 — T029).
// Idempotente via constraint unique(lead_id, provider, event_type) em conversion_events.
// Defensivo: se o provedor não está configurado na campanha, ignora aquele provedor.
// Os envios reais (Meta CAPI / GA4 Measurement Protocol) são best-effort.

type EventType = 'lead_cadastrado' | 'simulado_iniciado' | 'simulado_concluido' | 'clique_live'

type Tracking = {
  meta_pixel_id?: string
  meta_access_token?: string
  ga_measurement_id?: string
  ga_api_secret?: string
}

function sha256(v: string): string {
  return createHash('sha256').update(v.trim().toLowerCase()).digest('hex')
}

async function postMeta(tracking: Tracking, eventType: string, email: string): Promise<boolean> {
  if (!tracking.meta_pixel_id || !tracking.meta_access_token) return false
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${tracking.meta_pixel_id}/events?access_token=${tracking.meta_access_token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [
            {
              event_name: eventType,
              event_time: Math.floor(Date.now() / 1000),
              action_source: 'website',
              user_data: { em: [sha256(email)] },
            },
          ],
        }),
      }
    )
    return res.ok
  } catch {
    return false
  }
}

async function postGA4(tracking: Tracking, eventType: string, clientId: string): Promise<boolean> {
  if (!tracking.ga_measurement_id || !tracking.ga_api_secret) return false
  try {
    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${tracking.ga_measurement_id}&api_secret=${tracking.ga_api_secret}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, events: [{ name: eventType }] }),
      }
    )
    return res.ok
  } catch {
    return false
  }
}

/** Registra e tenta enviar o evento de conversão aos pixels configurados na campanha. */
export async function sendConversionEvent(leadId: string, eventType: EventType): Promise<void> {
  const service = createServiceClient()

  const { data: lead } = await service
    .from('leads')
    .select('email, campaign_id')
    .eq('id', leadId)
    .single()
  if (!lead) return

  const { data: campaign } = await service
    .from('campaigns')
    .select('tracking')
    .eq('id', lead.campaign_id)
    .single()
  const tracking = (campaign?.tracking ?? {}) as Tracking

  const providers: { name: 'meta' | 'google'; send: () => Promise<boolean> }[] = [
    { name: 'meta', send: () => postMeta(tracking, eventType, lead.email) },
    { name: 'google', send: () => postGA4(tracking, eventType, leadId) },
  ]

  for (const p of providers) {
    // Reserva idempotente (unique lead_id, provider, event_type).
    const { error } = await service.from('conversion_events').insert({
      lead_id: leadId,
      provider: p.name,
      event_type: eventType,
      event_id: `${leadId}:${eventType}:${p.name}`,
      status: 'falha',
    })
    if (error) continue // já enviado antes (conflito) ou provedor inexistente

    const ok = await p.send()
    if (ok) {
      await service
        .from('conversion_events')
        .update({ status: 'enviado', sent_at: new Date().toISOString() })
        .eq('lead_id', leadId)
        .eq('provider', p.name)
        .eq('event_type', eventType)
    }
  }
}

/** Resolve o lead correspondente a um aluno numa campanha (por e-mail). */
export async function findLeadIdByUserEmail(
  campaignId: string,
  email: string
): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('leads')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('email', email.toLowerCase())
    .maybeSingle()
  return data?.id ?? null
}
