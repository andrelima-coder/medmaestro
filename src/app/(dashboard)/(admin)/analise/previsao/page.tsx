import Link from 'next/link'
import { computePrevisao, type DimensionKey } from '@/lib/analytics/previsao'
import { PrevisaoDashboard } from '@/components/analise/previsao-charts'

export const metadata = { title: 'Previsão de prova — MedMaestro' }

type SearchParams = { dim?: string }

export default async function PrevisaoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const dimension: DimensionKey = params.dim === 'modulo' ? 'modulo' : 'topico_edital'


  const data = await computePrevisao({ dimension })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link href="/analise" style={{ fontSize: 12, color: 'var(--mm-muted, #5F7288)', textDecoration: 'none' }}>
              Análise
            </Link>
            <span style={{ color: 'var(--mm-muted, #5F7288)', fontSize: 12 }}>/</span>
            <span style={{ fontSize: 12, color: 'var(--mm-gold, #D40754)' }}>Previsão</span>
          </div>
          <h1 className="font-[family-name:var(--font-syne)]" style={{ fontSize: 20, fontWeight: 700, color: 'var(--mm-text, #0E2841)' }}>
            Previsão de prova {data.meta.generatedAtYear}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--mm-muted, #5F7288)', marginTop: 2 }}>
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
        border: `1px solid ${active ? 'var(--mm-gold, #D40754)' : 'rgba(14,40,65,0.08)'}`,
        background: active ? 'rgba(212,7,84,0.12)' : 'transparent',
        color: active ? 'var(--mm-gold, #D40754)' : 'var(--mm-muted, #5F7288)',
      }}
    >
      {label}
    </Link>
  )
}
