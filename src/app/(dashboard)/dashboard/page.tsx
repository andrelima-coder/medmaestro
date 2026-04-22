import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ROLE_LABELS } from '@/types'

export const metadata = { title: 'Dashboard — MedMaestro' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const service = createServiceClient()

  const [profileRes, questoesRes, revisaoRes, lotesRes, semTagRes, semComentarioRes] =
    await Promise.all([
      service.from('profiles').select('role, full_name').eq('id', user!.id).single(),
      service.from('questions').select('status', { count: 'exact' }),
      service
        .from('questions')
        .select('id', { count: 'exact' })
        .in('status', ['pending_extraction', 'in_review']),
      service
        .from('jobs')
        .select('id', { count: 'exact' })
        .in('status', ['pending', 'processing']),
      service
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .not('id', 'in', `(select question_id from question_tags)`),
      service
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .not('id', 'in', `(select question_id from question_comments)`),
    ])

  const profile = profileRes.data
  const name = profile?.full_name ?? user?.email ?? 'Usuário'
  const roleLabel = ROLE_LABELS[profile?.role as keyof typeof ROLE_LABELS] ?? ''

  const allQuestions = questoesRes.data ?? []
  const totalQuestoes = questoesRes.count ?? 0

  const statusCounts: Record<string, number> = {}
  for (const q of allQuestions) {
    const s = (q.status ?? 'pending_extraction') as string
    statusCounts[s] = (statusCounts[s] ?? 0) + 1
  }

  const naRevisao = revisaoRes.count ?? 0
  const lotesAtivos = lotesRes.count ?? 0
  const semTag = semTagRes.count ?? 0
  const semComentario = semComentarioRes.count ?? 0

  const STATUS_DISPLAY = [
    { key: 'pending_extraction', label: 'A extrair', color: 'text-blue-400' },
    { key: 'in_review', label: 'Em revisão', color: 'text-purple-400' },
    { key: 'approved', label: 'Aprovadas', color: 'text-green-400' },
    { key: 'published', label: 'Publicadas', color: 'text-emerald-400' },
    { key: 'rejected', label: 'Rejeitadas', color: 'text-red-400' },
  ]

  return (
    <div className="aurora-bg flex flex-col gap-6">
      {/* Saudação */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Olá, {name.split(' ')[0]}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{roleLabel} · MedMaestro</p>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total de questões" value={totalQuestoes} href="/questoes" />
        <KpiCard label="Na fila de revisão" value={naRevisao} href="/revisao" accent="purple" />
        <KpiCard label="Lotes em processamento" value={lotesAtivos} href="/lotes" accent="blue" />
        <KpiCard
          label="Questões sem tag"
          value={semTag}
          href="/questoes"
          accent={semTag > 0 ? 'amber' : undefined}
        />
      </div>

      {/* Breakdown por status */}
      <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-5 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Questões por status</h2>
        <div className="flex flex-col gap-2">
          {STATUS_DISPLAY.map(({ key, label, color }) => {
            const count = statusCounts[key] ?? 0
            const pct = totalQuestoes > 0 ? Math.round((count / totalQuestoes) * 100) : 0
            return (
              <div key={key} className="flex items-center gap-3">
                <span className={`text-xs w-28 shrink-0 ${color}`}>{label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-current ${color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                  {count}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Alertas de qualidade */}
      {(semTag > 0 || semComentario > 0) && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col gap-2">
          <p className="text-xs font-semibold text-amber-400">Atenção</p>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {semTag > 0 && (
              <li>
                <Link href="/questoes" className="hover:text-foreground transition-colors">
                  {semTag} questão{semTag !== 1 ? 's' : ''} sem tag →
                </Link>
              </li>
            )}
            {semComentario > 0 && (
              <li>
                <Link href="/questoes" className="hover:text-foreground transition-colors">
                  {semComentario} questão{semComentario !== 1 ? 's' : ''} sem comentário →
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Ações rápidas */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/revisao"
          className="rounded-lg border border-white/8 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
        >
          Ir para revisão →
        </Link>
        <Link
          href="/questoes"
          className="rounded-lg border border-white/8 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
        >
          Banco de questões →
        </Link>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  href,
  accent,
}: {
  label: string
  value: number
  href: string
  accent?: 'purple' | 'blue' | 'amber'
}) {
  const accentMap: Record<string, string> = {
    purple: 'text-purple-400',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
  }
  const accentClass = (accent ? accentMap[accent] : null) ?? 'text-foreground'

  return (
    <Link
      href={href}
      className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-4 flex flex-col gap-1 hover:bg-white/4 transition-colors"
    >
      <span className={`text-2xl font-semibold tabular-nums ${accentClass}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </Link>
  )
}
