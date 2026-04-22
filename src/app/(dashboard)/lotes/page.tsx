import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Lotes — MedMaestro' }

const STATUS_LABELS: Record<string, string> = {
  pending: 'Aguardando',
  extracting: 'Extraindo',
  classifying: 'Classificando',
  done: 'Concluído',
  error: 'Erro',
}

const STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  extracting: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  classifying: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  done: 'bg-green-500/15 text-green-400 border-green-500/30',
  error: 'bg-destructive/15 text-destructive border-destructive/30',
}

export default async function LotesPage() {
  const supabase = await createClient()

  const { data: exams } = await supabase
    .from('exams')
    .select('id, year, booklet_color, status, created_at, specialties(name, exam_boards(name))')
    .order('created_at', { ascending: false })

  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Lotes</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Provas enviadas para extração
          </p>
        </div>
        <Button render={<Link href="/lotes/novo" />}>+ Novo lote</Button>
      </div>

      {!exams || exams.length === 0 ? (
        <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-10 text-center text-sm text-muted-foreground">
          Nenhum lote enviado ainda.
        </div>
      ) : (
        <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/7 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Banca / Especialidade</th>
                <th className="px-4 py-3 font-medium">Ano</th>
                <th className="px-4 py-3 font-medium">Cor</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Enviado em</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => {
                const specialty = exam.specialties as unknown as { name: string; exam_boards: { name: string } | null } | null
                const boardName = specialty?.exam_boards?.name ?? ''
                const specialtyName = specialty?.name ?? '—'
                const label = boardName ? `${boardName} · ${specialtyName}` : specialtyName
                const statusKey = exam.status ?? 'pending'
                const date = new Date(exam.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: 'numeric'
                })

                return (
                  <tr
                    key={exam.id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/lotes/${exam.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                        {label}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{exam.year}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{exam.booklet_color ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[statusKey] ?? STATUS_CLASSES.pending}`}>
                        {STATUS_LABELS[statusKey] ?? statusKey}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{date}</td>
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
