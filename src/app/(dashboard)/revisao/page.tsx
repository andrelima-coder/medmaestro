import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Fila de Revisão — MedMaestro' }

const STATUS_LABELS: Record<string, string> = {
  pending_extraction: 'Aguardando',
  in_review: 'Em revisão',
}

const STATUS_CLASSES: Record<string, string> = {
  pending_extraction: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  in_review: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
}

function confidenceBar(score: number | null): string {
  if (score === null) return '—'
  return `${score}%`
}

export default async function RevisaoPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const service = createServiceClient()
  const now = new Date().toISOString()

  const { data: questions } = await service
    .from('questions')
    .select(
      'id, question_number, stem, status, has_images, extraction_confidence, exam_id, exams(year, booklet_color, specialties(name)), review_assignments(assigned_to, expires_at, status)'
    )
    .in('status', ['pending_extraction', 'in_review'])

  const reviewerIds = [
    ...new Set(
      (questions ?? [])
        .map((q) => {
          const ra = q.review_assignments as unknown as { assigned_to: string; expires_at: string; status: string }[] | null
          return ra?.[0]?.assigned_to
        })
        .filter(Boolean) as string[]
    ),
  ]

  const profileMap: Record<string, string> = {}
  if (reviewerIds.length > 0) {
    const { data: profiles } = await service
      .from('profiles')
      .select('id, full_name')
      .in('id', reviewerIds)
    for (const p of profiles ?? []) {
      profileMap[p.id] = p.full_name ?? 'Revisor'
    }
  }

  const STATUS_RANK: Record<string, number> = { in_review: 0, pending_extraction: 1 }
  const sorted = (questions ?? []).slice().sort((a, b) => {
    const rankA = STATUS_RANK[a.status ?? 'pending_extraction'] ?? 1
    const rankB = STATUS_RANK[b.status ?? 'pending_extraction'] ?? 1
    if (rankA !== rankB) return rankA - rankB
    const imgA = (a.has_images as boolean | null) ? 0 : 1
    const imgB = (b.has_images as boolean | null) ? 0 : 1
    if (imgA !== imgB) return imgA - imgB
    const confA = (a.extraction_confidence as number | null) ?? 100
    const confB = (b.extraction_confidence as number | null) ?? 100
    return confA - confB
  })

  const total = sorted.length

  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Fila de Revisão</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total === 0 ? 'Nenhuma questão pendente' : `${total} questão${total !== 1 ? 's' : ''} pendente${total !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-10 text-center text-sm text-muted-foreground">
          Fila vazia — todas as questões foram revisadas.
        </div>
      ) : (
        <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/7 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Questão</th>
                <th className="px-4 py-3 font-medium">Exame</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-center">Img</th>
                <th className="px-4 py-3 font-medium">Confiança</th>
                <th className="px-4 py-3 font-medium">Revisor</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((q) => {
                const exam = q.exams as unknown as { year: number; booklet_color: string | null; specialties: { name: string } | null } | null
                const ra = q.review_assignments as unknown as { assigned_to: string; expires_at: string; status: string }[] | null
                const assignment = ra?.[0] ?? null
                const isActivelyLocked =
                  assignment?.status === 'in_progress' &&
                  new Date(assignment.expires_at) > new Date(now) &&
                  assignment.assigned_to !== user?.id
                const reviewerName = assignment ? (profileMap[assignment.assigned_to] ?? 'Revisor') : null
                const stem = (q.stem ?? '').slice(0, 80) + ((q.stem?.length ?? 0) > 80 ? '…' : '')
                const statusKey = q.status ?? 'pending_extraction'

                return (
                  <tr
                    key={q.id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors"
                  >
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-foreground">Q{q.question_number}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{stem || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {exam?.specialties?.name ?? '—'}{exam ? ` · ${exam.year}` : ''}
                      {exam?.booklet_color ? ` · ${exam.booklet_color.charAt(0).toUpperCase() + exam.booklet_color.slice(1)}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[statusKey] ?? STATUS_CLASSES.pending_extraction}`}>
                        {STATUS_LABELS[statusKey] ?? statusKey}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(q.has_images as boolean | null) ? (
                        <span title="Contém imagem" className="text-purple-400">⬛</span>
                      ) : (
                        <span className="text-white/20">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {confidenceBar(q.extraction_confidence as number | null)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {isActivelyLocked && reviewerName ? reviewerName : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {isActivelyLocked ? (
                        <span className="text-xs text-muted-foreground">Em revisão</span>
                      ) : (
                        <Link
                          href={`/revisao/${q.id}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Revisar →
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
