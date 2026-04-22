import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Análise — MedMaestro' }

const ROLE_RANK: Record<string, number> = { analista: 0, professor: 1, admin: 2, superadmin: 3 }

const STATUS_LABELS: Record<string, string> = {
  pending_extraction: 'Extração pendente',
  pending_review: 'Revisão pendente',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  flagged: 'Sinalizada',
}

const STATUS_COLORS: Record<string, string> = {
  pending_extraction: 'bg-gray-500/30 text-gray-300',
  pending_review: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-red-500/20 text-red-300',
  flagged: 'bg-orange-500/20 text-orange-300',
}

export default async function AnalisePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if ((ROLE_RANK[profile?.role ?? ''] ?? -1) < ROLE_RANK['admin']) redirect('/dashboard')

  // Queries paralelas
  const [{ data: allQuestions }, { data: allExams }, { data: tagLinks }] = await Promise.all([
    service.from('questions').select('status, exam_id'),
    service
      .from('exams')
      .select('id, board_id, specialty_id, year, exam_boards(name, short_name), specialties(name)'),
    service.from('question_tags').select('tag_id, tags!inner(label, dimension)'),
  ])

  const questions = allQuestions ?? []
  const exams = allExams ?? []

  const totalQuestions = questions.length
  const approvedCount = questions.filter((q) => q.status === 'approved').length
  const approvalRate = totalQuestions > 0 ? Math.round((approvedCount / totalQuestions) * 100) : 0

  // Status breakdown
  const statusMap: Record<string, number> = {}
  questions.forEach((q) => {
    statusMap[q.status as string] = (statusMap[q.status as string] ?? 0) + 1
  })
  const statusData = Object.entries(statusMap)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)

  // Por banca
  const examById = Object.fromEntries(exams.map((e) => [e.id, e]))
  const boardMap: Record<string, { name: string; total: number; approved: number }> = {}
  questions.forEach((q) => {
    const exam = examById[q.exam_id as string]
    if (!exam) return
    const board = exam.exam_boards as { name: string; short_name: string } | null
    const key = board?.name ?? 'Sem banca'
    if (!boardMap[key]) boardMap[key] = { name: key, total: 0, approved: 0 }
    boardMap[key].total++
    if (q.status === 'approved') boardMap[key].approved++
  })
  const byBoard = Object.values(boardMap).sort((a, b) => b.total - a.total)

  // Por especialidade
  const specMap: Record<string, { name: string; total: number; approved: number }> = {}
  questions.forEach((q) => {
    const exam = examById[q.exam_id as string]
    if (!exam) return
    const spec = exam.specialties as { name: string } | null
    const key = spec?.name ?? 'Sem especialidade'
    if (!specMap[key]) specMap[key] = { name: key, total: 0, approved: 0 }
    specMap[key].total++
    if (q.status === 'approved') specMap[key].approved++
  })
  const bySpecialty = Object.values(specMap).sort((a, b) => b.total - a.total).slice(0, 10)

  // Tags mais usadas
  const tagCount: Record<string, { label: string; dimension: string; count: number }> = {}
  ;(tagLinks ?? []).forEach((tl) => {
    const tag = tl.tags as { label: string; dimension: string } | null
    if (!tag) return
    const key = tl.tag_id as string
    if (!tagCount[key]) tagCount[key] = { label: tag.label, dimension: tag.dimension, count: 0 }
    tagCount[key].count++
  })
  const topTags = Object.values(tagCount).sort((a, b) => b.count - a.count).slice(0, 8)

  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Análise</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Visão geral do banco de questões</p>
      </div>

      {totalQuestions === 0 ? (
        <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 p-10 text-center text-sm text-muted-foreground">
          Nenhuma questão no banco ainda. Comece fazendo upload em{' '}
          <a href="/lotes/novo" className="text-[var(--mm-gold)] hover:underline">Lotes → Novo lote</a>.
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total de questões', value: totalQuestions.toLocaleString('pt-BR') },
              { label: 'Taxa de aprovação', value: `${approvalRate}%` },
              { label: 'Bancas', value: byBoard.length },
              { label: 'Especialidades', value: bySpecialty.length },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-4"
              >
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Status breakdown */}
          <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-foreground">Por status</h2>
            <div className="flex flex-col gap-2.5">
              {statusData.map((row) => {
                const pct = totalQuestions > 0 ? (row.count / totalQuestions) * 100 : 0
                return (
                  <div key={row.status} className="flex items-center gap-3">
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[row.status] ?? 'bg-white/10 text-muted-foreground'}`}>
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--mm-gold)]/60 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {row.count.toLocaleString('pt-BR')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Por banca */}
            {byBoard.length > 0 && (
              <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-5 flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-foreground">Por banca</h2>
                <div className="flex flex-col gap-2">
                  {byBoard.map((row) => {
                    const pct = row.total > 0 ? (row.approved / row.total) * 100 : 0
                    return (
                      <div key={row.name} className="flex items-center gap-3">
                        <span className="text-xs text-foreground truncate w-32 shrink-0">{row.name}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full bg-green-400/50" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                          {row.approved}/{row.total}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Por especialidade */}
            {bySpecialty.length > 0 && (
              <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-5 flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-foreground">Por especialidade (top 10)</h2>
                <div className="flex flex-col gap-2">
                  {bySpecialty.map((row) => {
                    const pct = row.total > 0 ? (row.approved / row.total) * 100 : 0
                    return (
                      <div key={row.name} className="flex items-center gap-3">
                        <span className="text-xs text-foreground truncate w-32 shrink-0">{row.name}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-400/50" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                          {row.approved}/{row.total}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Tags mais usadas */}
          {topTags.length > 0 && (
            <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-5 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-foreground">Tags mais usadas</h2>
              <div className="flex flex-wrap gap-2">
                {topTags.map((t) => (
                  <span
                    key={t.label}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/8 bg-white/5 text-xs text-foreground"
                  >
                    {t.label}
                    <span className="text-muted-foreground">{t.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
