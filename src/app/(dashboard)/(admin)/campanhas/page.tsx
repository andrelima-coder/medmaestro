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
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr] gap-2 border-b border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>Nome</span>
            <span>Status</span>
            <span>Acesso</span>
            <span>embed_id</span>
          </div>
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campanhas/${c.id}`}
              className="grid grid-cols-[2fr_1fr_1fr_1.5fr] items-center gap-2 border-b border-border/50 px-4 py-3 text-sm transition-colors last:border-0 hover:bg-card"
            >
              <span className="truncate font-medium text-foreground">{c.name}</span>
              <span className="text-muted-foreground">{c.status}</span>
              <span className="text-muted-foreground">{c.access_mode}</span>
              <code className="truncate text-xs text-muted-foreground">
                {c.campaign_form?.[0]?.embed_id ?? '—'}
              </code>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
