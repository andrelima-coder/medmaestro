import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'

// Lembretes por e-mail da camada do aluno (feature 001 — T028).
// Idempotente por campanha/tipo via tabela campaign_reminders.

const FROM = 'MedMaestro <noreply@medmaestro.com.br>'

type ReminderType = 'abertura' | 'live'

function resend() {
  return new Resend(process.env.RESEND_API_KEY)
}

/** Rodapé padrão: identificação do remetente + link de descadastro (LGPD). */
function footerHtml(leadId: string, campaignName: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const unsub = `${base}/api/public/unsubscribe?lead=${encodeURIComponent(leadId)}`
  return `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5" />
  <p style="font-size:12px;color:#777;line-height:1.5">
    Você recebeu este e-mail porque se cadastrou no simulado "${campaignName}" do MedMaestro.<br />
    MedMaestro · medmaestro.com.br<br />
    <a href="${unsub}" style="color:#777">Não quero mais receber estes e-mails (descadastrar)</a>
  </p>`
}

/** Link "Adicionar ao Google Agenda" para a data de abertura. */
function calendarLink(title: string, startISO: string): string {
  const start = startISO.replace(/[-:]/g, '').replace(/\.\d+/, '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${start}`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function openingHtml(name: string, openISO: string | null, footer: string): string {
  const cal = openISO ? calendarLink(`Simulado: ${name}`, openISO) : null
  return `<div style="font-family:sans-serif">
    <h2>Seu simulado "${name}" vai abrir!</h2>
    <p>Prepare-se: a janela de realização está chegando. Faça de uma só vez, dentro do tempo, para a experiência mais realista.</p>
    ${cal ? `<p><a href="${cal}">Adicionar à agenda</a></p>` : ''}
    ${footer}
  </div>`
}

function liveHtml(name: string, liveUrl: string | null, footer: string): string {
  return `<div style="font-family:sans-serif">
    <h2>Correção comentada ao vivo — ${name}</h2>
    <p>Tire suas dúvidas e veja a resolução das questões na nossa live.</p>
    ${liveUrl ? `<p><a href="${liveUrl}">Assistir / ativar lembrete no YouTube</a></p>` : ''}
    ${footer}
  </div>`
}

/**
 * Envia o lembrete de um tipo para todos os leads consentidos da campanha.
 * Retorna o número de destinatários, ou -1 se já havia sido enviado.
 */
export async function sendCampaignReminder(
  campaignId: string,
  type: ReminderType
): Promise<number> {
  const service = createServiceClient()

  // Dedup: tenta reservar o envio.
  const { error: dupErr } = await service
    .from('campaign_reminders')
    .insert({ campaign_id: campaignId, type, recipients: 0 })
  if (dupErr) return -1 // unique violation = já enviado

  const { data: campaign } = await service
    .from('campaigns')
    .select('name, window_start, live_url')
    .eq('id', campaignId)
    .single()
  if (!campaign) return 0

  const { data: leads } = await service
    .from('leads')
    .select('id, email, unsubscribed_at, lead_consents(id)')
    .eq('campaign_id', campaignId)

  // Só leads consentidos e que não pediram descadastro.
  const recipients = (leads ?? [])
    .filter(
      (l) =>
        ((l.lead_consents as { id: string }[] | null)?.length ?? 0) > 0 &&
        !(l as { unsubscribed_at: string | null }).unsubscribed_at
    )
    .map((l) => ({ id: l.id as string, email: l.email as string }))

  const campaignName = campaign.name ?? 'Simulado'
  const subject =
    type === 'abertura'
      ? `Seu simulado "${campaignName}" vai abrir`
      : `Live de correção — ${campaignName}`

  const client = resend()
  let sent = 0
  for (const r of recipients) {
    const footer = footerHtml(r.id, campaignName)
    const html =
      type === 'abertura'
        ? openingHtml(campaignName, campaign.window_start, footer)
        : liveHtml(campaignName, campaign.live_url, footer)
    try {
      await client.emails.send({ from: FROM, to: r.email, subject, html })
      sent++
    } catch (e) {
      console.error('[lembrete]', e)
    }
  }

  await service
    .from('campaign_reminders')
    .update({ recipients: sent })
    .eq('campaign_id', campaignId)
    .eq('type', type)

  return recipients.length
}
