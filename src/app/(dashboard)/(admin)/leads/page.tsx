import { createServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Leads — MedMaestro' }

type LeadRow = {
  id: string
  email: string
  fields: Record<string, unknown> | null
  segment: string | null
  origin: string | null
  email_verified_at: string | null
  created_at: string
  lead_consents: { id: string }[] | null
  campaigns: { name: string | null } | null
}

const SEGMENTS = [
  { value: '', label: 'Todos os segmentos' },
  { value: 'ja_aluno', label: 'Já é aluno' },
  { value: 'nao_aluno', label: 'Não é aluno' },
  { value: 'aluno_outro_curso', label: 'Aluno de outro curso' },
]

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; segment?: string }>
}) {
  const sp = await searchParams

  const service = createServiceClient()

  const { data: campaigns } = await service
    .from('campaigns')
    .select('id, name')
    .order('created_at', { ascending: false })

  let query = service
    .from('leads')
    .select('id, email, fields, segment, origin, email_verified_at, created_at, lead_consents(id), campaigns(name)')
    .order('created_at', { ascending: false })
    .limit(500)
  if (sp.campaign) query = query.eq('campaign_id', sp.campaign)
  if (sp.segment) query = query.eq('segment', sp.segment)
  const { data } = await query
  const leads = (data ?? []) as unknown as LeadRow[]
  const consented = leads.filter((l) => (l.lead_consents?.length ?? 0) > 0).length

  const qs = new URLSearchParams()
  if (sp.campaign) qs.set('campaign', sp.campaign)
  if (sp.segment) qs.set('segment', sp.segment)
  const exportQs = qs.toString()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {leads.length} leads no filtro · {consented} com consentimento (exportáveis)
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/leads/export?format=csv${exportQs ? '&' + exportQs : ''}`}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground"
          >
            Exportar CSV
          </a>
          <a
            href={`/api/leads/export?format=xlsx${exportQs ? '&' + exportQs : ''}`}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Exportar XLSX
          </a>
        </div>
      </div>

      {/* Filtros */}
      <form className="flex flex-wrap gap-3" method="get">
        <select
          name="campaign"
          defaultValue={sp.campaign ?? ''}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Todas as campanhas</option>
          {(campaigns ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="segment"
          defaultValue={sp.segment ?? ''}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {SEGMENTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm text-foreground">
          Filtrar
        </button>
      </form>

      {leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum lead no filtro.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2">Nome</th>
              <th className="py-2">E-mail</th>
              <th className="py-2">WhatsApp</th>
              <th className="py-2">Campanha</th>
              <th className="py-2">Segmento</th>
              <th className="py-2">Verificado</th>
              <th className="py-2">LGPD</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-b border-border/50">
                <td className="py-2 text-foreground">{String(l.fields?.name ?? '—')}</td>
                <td className="py-2">{l.email}</td>
                <td className="py-2">{String(l.fields?.whatsapp ?? '—')}</td>
                <td className="py-2">{l.campaigns?.name ?? '—'}</td>
                <td className="py-2">{l.segment ?? '—'}</td>
                <td className="py-2">{l.email_verified_at ? '✓' : '—'}</td>
                <td className="py-2">
                  {(l.lead_consents?.length ?? 0) > 0 ? '✓' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
