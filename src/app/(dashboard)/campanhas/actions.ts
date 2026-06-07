'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

// Campanha "Simulado Aberto para Alunos" (feature 001 — T015 + T013).
// Cria a campanha sobre um molde de simulado existente e o formulário embedável
// (campaign_form) com embed_id, consumido pelo endpoint público /api/public/leads.

async function assertAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const rank: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }
  if ((rank[profile?.role ?? ''] ?? -1) < rank['admin']) return null
  return user
}

export type CampaignState = { ok: boolean; error?: string; embedId?: string } | null

export async function createCampaignAction(
  _prev: CampaignState,
  formData: FormData
): Promise<CampaignState> {
  const user = await assertAdmin()
  if (!user) return { ok: false, error: 'Sem permissão.' }

  const name = (formData.get('name') as string)?.trim()
  const simuladoId = (formData.get('simulado_id') as string)?.trim()
  const duration = Number(formData.get('duration_minutes'))
  const accessMode = (formData.get('access_mode') as string)?.trim() // imediato|data_unica|janela
  const windowStart = (formData.get('window_start') as string) || null
  const windowEnd = (formData.get('window_end') as string) || null
  const pauseAllowed = formData.get('pause_allowed') === 'on'
  const publish = formData.get('publish') === 'on'

  // Liberações.
  const releases = {
    nota_gabarito: formData.get('rel_nota') === 'on',
    comentarios_mode: (formData.get('rel_coment_mode') as string) || 'oculto', // oculto|imediato|data
    comentarios_release_at: (formData.get('rel_coment_at') as string) || null,
    revisao: formData.get('rel_revisao') === 'on',
    dashboard: formData.get('rel_dashboard') === 'on', // libera o dashboard de desempenho (Fase 2)
  }

  const liveAt = (formData.get('live_at') as string) || null
  const liveUrl = (formData.get('live_url') as string)?.trim() || null

  // Rastreamento/pixel por campanha (T016).
  const tracking: Record<string, string> = {}
  const metaPixel = (formData.get('meta_pixel_id') as string)?.trim()
  const metaToken = (formData.get('meta_access_token') as string)?.trim()
  const gaId = (formData.get('ga_measurement_id') as string)?.trim()
  const gaSecret = (formData.get('ga_api_secret') as string)?.trim()
  if (metaPixel) tracking.meta_pixel_id = metaPixel
  if (metaToken) tracking.meta_access_token = metaToken
  if (gaId) tracking.ga_measurement_id = gaId
  if (gaSecret) tracking.ga_api_secret = gaSecret

  // Formulário embedável.
  const allowedDomains = ((formData.get('allowed_domains') as string) || '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
  const requireEmailVerification = formData.get('require_email_verification') === 'on'
  const extraFields = ((formData.get('extra_fields') as string) || '')
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)

  // Validações.
  if (!name || !simuladoId) return { ok: false, error: 'Nome e simulado são obrigatórios.' }
  if (!Number.isFinite(duration) || duration <= 0)
    return { ok: false, error: 'Duração inválida.' }
  if (!['imediato', 'data_unica', 'janela'].includes(accessMode))
    return { ok: false, error: 'Modo de acesso inválido.' }
  if (accessMode === 'janela' && (!windowStart || !windowEnd))
    return { ok: false, error: 'Janela exige início e fim.' }
  if (accessMode === 'janela' && windowStart && windowEnd && windowEnd <= windowStart)
    return { ok: false, error: 'O fim da janela deve ser depois do início.' }

  const service = createServiceClient()

  const { data: campaign, error: cErr } = await service
    .from('campaigns')
    .insert({
      simulado_id: simuladoId,
      name,
      duration_minutes: duration,
      access_mode: accessMode,
      window_start: accessMode === 'imediato' ? null : windowStart,
      window_end: accessMode === 'janela' ? windowEnd : null,
      pause_allowed: pauseAllowed,
      releases,
      live_at: liveAt,
      live_url: liveUrl,
      tracking,
      status: publish ? 'publicada' : 'rascunho',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (cErr || !campaign) {
    return { ok: false, error: cErr?.message ?? 'Falha ao criar campanha.' }
  }

  // Campos do formulário: mínimos + extras configurados.
  const fields = [
    { key: 'name', label: 'Nome completo', type: 'text', required: true },
    { key: 'email', label: 'E-mail', type: 'email', required: true },
    { key: 'whatsapp', label: 'WhatsApp', type: 'tel', required: true },
    ...extraFields.map((label) => ({
      key: label.toLowerCase().replace(/\s+/g, '_'),
      label,
      type: 'text',
      required: false,
    })),
  ]

  const embedId = randomUUID()
  const { error: fErr } = await service.from('campaign_form').insert({
    campaign_id: campaign.id,
    fields,
    embed_id: embedId,
    allowed_domains: allowedDomains,
    require_email_verification: requireEmailVerification,
  })

  if (fErr) {
    return { ok: false, error: `Campanha criada, mas o formulário falhou: ${fErr.message}` }
  }

  await logAudit(user.id, 'campaign', campaign.id, 'campaign_created', null, {
    name,
    access_mode: accessMode,
    status: publish ? 'publicada' : 'rascunho',
  })

  revalidatePath('/campanhas')
  return { ok: true, embedId }
}

export async function listSimuladosForSelect() {
  const service = createServiceClient()
  const { data } = await service
    .from('simulados')
    .select('id, title')
    .order('created_at', { ascending: false })
    .limit(200)
  return data ?? []
}
