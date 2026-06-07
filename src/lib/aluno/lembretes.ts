import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'

// Lembretes por e-mail da camada do aluno (feature 001 — T028).
// Idempotente por campanha/tipo via tabela campaign_reminders.

const FROM = 'MedMaestro <noreply@medmaestro.com.br>'

type ReminderType = 'abertura' | 'live'

function resend() {
  return new Resend(process.env.RESEND_API_KEY)
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

function openingHtml(name: string, openISO: string | null): string {
  const cal = openISO ? calendarLink(`Simulado: ${name}`, openISO) : null
  return `<div style="font-family:sans-serif">
    <h2>Seu simulado "${name}" vai abrir!</h2>
    <p>Prepare-se: a janela de realização está chegando. Faça de uma só vez, dentro do tempo, para a experiência mais realista.</p>
    ${cal ? `<p><a href="${cal}">Adicionar à agenda</a></p>` : ''}
  </div>`
}

function liveHtml(name: string, liveUrl: string | null): string {
  return `<div style="font-family:sans-serif">
    <h2>Correção comentada ao vivo — ${name}</h2>
    <p>Tire suas dúvidas e veja a resolução das questões na nossa live.</p>
    ${liveUrl ? `<p><a href="${liveUrl}">Assistir / ativar lembrete no YouTube</a></p>` : ''}
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
    .select('email, lead_consents(id)')
    .eq('campaign_id', campaignId)

  const recipients = (leads ?? [])
    .filter((l) => ((l.lead_consents as { id: string }[] | null)?.length ?? 0) > 0)
    .map((l) => l.email)

  const subject =
    type === 'abertura'
      ? `Seu simulado "${campaign.name}" vai abrir`
      : `Live de correção — ${campaign.name}`
  const html =
    type === 'abertura'
      ? openingHtml(campaign.name ?? 'Simulado', campaign.window_start)
      : liveHtml(campaign.name ?? 'Simulado', campaign.live_url)

  const client = resend()
  for (const to of recipients) {
    try {
      await client.emails.send({ from: FROM, to, subject, html })
    } catch (e) {
      console.error('[lembrete]', e)
    }
  }

  await service
    .from('campaign_reminders')
    .update({ recipients: recipients.length })
    .eq('campaign_id', campaignId)
    .eq('type', type)

  return recipients.length
}
