import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { computePrevisao, type DimensionKey } from '@/lib/analytics/previsao'
import { PrevisaoDashboard } from '@/components/analise/previsao-charts'

export const metadata = { title: 'Previsão de prova — MedMaestro' }

const ROLE_RANK: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }

type SearchParams = { dim?: string }

export default async function PrevisaoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const dimension: DimensionKey = params.dim === 'modulo' ? 'modulo' : 'topico_edital'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if ((ROLE_RANK[profile?.role ?? ''] ?? -1) < ROLE_RANK['admin']) redirect('/dashboard')

  const data = await computePrevisao({ dimension })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link href="/analise" style={{ fontSize: 12, color: 'var(--mm-muted, #9AA0AA)', textDecoration: 'none' }}>
              Análise
            </Link>
            <span style={{ color: 'var(--mm-muted, #9AA0AA)', fontSize: 12 }}>/</span>
            <span style={{ fontSize: 12, color: 'var(--mm-gold, #C9A84C)' }}>Previsão</span>
          </div>
          <h1 className="font-[family-name:var(--font-syne)]" style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text, #E8E8EA)' }}>
            Previsão de prova {data.meta.generatedAtYear}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--mm-muted, #9AA0AA)', marginTop: 2 }}>
            Priorização de estudo por tópico, a partir do histórico de {data.years.length} provas.
          </p>
        </div>

        {/* Alternância de dimensão */}
        <div style={{ display: 'flex', gap: 6 }}>
          <DimTab href="/analise/previsao?dim=topico_edital" active={dimension === 'topico_edital'} label="Por tópico do edital" />
          <DimTab href="/analise/previsao?dim=modulo" active={dimension === 'modulo'} label="Por módulo" />
        </div>
      </div>

      <PrevisaoDashboard data={data} />
    </div>
  )
}

function DimTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: '6px 14px',
        borderRadius: 8,
        textDecoration: 'none',
        border: `1px solid ${active ? 'var(--mm-gold, #C9A84C)' : 'rgba(255,255,255,0.08)'}`,
        background: active ? 'rgba(201,168,76,0.12)' : 'transparent',
        color: active ? 'var(--mm-gold, #C9A84C)' : 'var(--mm-muted, #9AA0AA)',
      }}
    >
      {label}
    </Link>
  )
}
