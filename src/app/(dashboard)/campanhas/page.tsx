import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Campanhas — MedMaestro' }

type CampaignRow = {
  id: string
  name: string
  status: string
  access_mode: string
  created_at: string
  campaign_form: { embed_id: string }[] | null
}

export default async function CampanhasPage() {
  const service = createServiceClient()
  const { data } = await service
    .from('campaigns')
    .select('id, name, status, access_mode, created_at, campaign_form(embed_id)')
    .order('created_at', { ascending: false })
    .limit(100)

  const campaigns = (data ?? []) as CampaignRow[]

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Campanhas (Simulados Abertos)</h1>
        <Link
          href="/campanhas/nova"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Nova campanha
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma campanha ainda.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2">Nome</th>
              <th className="py-2">Status</th>
              <th className="py-2">Acesso</th>
              <th className="py-2">embed_id</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b border-border/50">
                <td className="py-2 text-foreground">{c.name}</td>
                <td className="py-2">{c.status}</td>
                <td className="py-2">{c.access_mode}</td>
                <td className="py-2">
                  <code className="text-xs">{c.campaign_form?.[0]?.embed_id ?? '—'}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
