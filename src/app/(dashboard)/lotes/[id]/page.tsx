import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { ExamProgress } from '@/components/lotes/exam-progress'

export const metadata = { title: 'Lote — MedMaestro' }

export default async function LotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: exam } = await supabase
    .from('exams')
    .select('id, year, color, status, specialties(name)')
    .eq('id', id)
    .single()

  if (!exam) notFound()

  const { count } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .eq('exam_id', id)

  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {(exam.specialties as unknown as { name: string } | null)?.name ?? 'Exame'} {exam.year}
          {exam.color ? ` · ${exam.color.charAt(0).toUpperCase() + exam.color.slice(1)}` : ''}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Progresso da extração</p>
      </div>

      <ExamProgress
        exam={{
          id: exam.id,
          status: exam.status as 'pending' | 'extracting' | 'done' | 'error',
          year: exam.year,
          color: exam.color,
          specialties: exam.specialties as unknown as { name: string } | null,
        }}
        initialCount={count ?? 0}
      />
    </div>
  )
}
