import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AssignmentBar } from '@/components/revisao/assignment-bar'

export const metadata = { title: 'Revisão — MedMaestro' }

const TEN_MINUTES_MS = 10 * 60 * 1000

const STATUS_LABELS: Record<string, string> = {
  extracted: 'Extraído',
  flagged: 'Sinalizado',
  reviewing: 'Em revisão',
  approved: 'Aprovado',
}

const STATUS_CLASSES: Record<string, string> = {
  extracted: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  flagged: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  reviewing: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  approved: 'bg-green-500/15 text-green-400 border-green-500/30',
}

export default async function RevisaoItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const service = createServiceClient()

  // Busca questão completa
  const { data: question } = await service
    .from('questions')
    .select(
      'id, question_no, stem, alternative_a, alternative_b, alternative_c, alternative_d, alternative_e, status, has_image, confidence_score, correct_answer, exam_id, exams(year, color, specialties(name, exam_boards(name)))'
    )
    .eq('id', id)
    .single()

  if (!question) notFound()

  const exam = question.exams as unknown as {
    year: number
    color: string | null
    specialties: { name: string; exam_boards: { name: string } | null } | null
  } | null

  const now = new Date()

  // Busca assignment existente
  const { data: assignment } = await service
    .from('review_assignments')
    .select('id, reviewer_id, expires_at')
    .eq('question_id', id)
    .single()

  const assignmentExpired = !assignment || new Date(assignment.expires_at) <= now
  const lockedByOther =
    !assignmentExpired && assignment.reviewer_id !== user.id

  // Busca nome do revisor atual (se locked by other)
  let lockedByName = ''
  if (lockedByOther) {
    const { data: lockerProfile } = await service
      .from('profiles')
      .select('full_name')
      .eq('id', assignment.reviewer_id)
      .single()
    lockedByName = lockerProfile?.full_name ?? 'outro revisor'
  }

  // Claim: cria/atualiza assignment para o usuário atual
  let expiresAt = assignment?.expires_at ?? ''
  if (!lockedByOther) {
    const newExpiresAt = new Date(now.getTime() + TEN_MINUTES_MS).toISOString()
    await service.from('review_assignments').upsert(
      {
        question_id: id,
        reviewer_id: user.id,
        assigned_at: now.toISOString(),
        expires_at: newExpiresAt,
      },
      { onConflict: 'question_id' }
    )
    await service
      .from('questions')
      .update({ status: 'reviewing', updated_at: now.toISOString() })
      .eq('id', id)
    expiresAt = newExpiresAt
  }

  // Busca nome do revisor atual (para o bar)
  const { data: myProfile } = await service
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()
  const reviewerName = myProfile?.full_name ?? user.email ?? 'Você'

  const boardName = exam?.specialties?.exam_boards?.name ?? ''
  const specialtyName = exam?.specialties?.name ?? ''
  const examLabel = [boardName, specialtyName, exam?.year, exam?.color ? exam.color.charAt(0).toUpperCase() + exam.color.slice(1) : '']
    .filter(Boolean)
    .join(' · ')

  const ALTERNATIVES = ['A', 'B', 'C', 'D', 'E'] as const
  const altMap: Record<string, string | null> = {
    A: question.alternative_a,
    B: question.alternative_b,
    C: question.alternative_c,
    D: question.alternative_d,
    E: question.alternative_e,
  }

  if (lockedByOther) {
    return (
      <div className="aurora-bg flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Link href="/revisao" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Fila
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-sm font-medium text-foreground">Q{question.question_no}</span>
        </div>
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-sm text-yellow-400">
          Esta questão está sendo revisada por <strong>{lockedByName}</strong>. Aguarde ou escolha outra.
        </div>
      </div>
    )
  }

  return (
    <div className="aurora-bg flex flex-col gap-4">
      {/* Breadcrumb + título */}
      <div className="flex items-center gap-3">
        <Link href="/revisao" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Fila
        </Link>
        <span className="text-white/20">/</span>
        <span className="text-sm font-medium text-foreground">Q{question.question_no}</span>
        <span className="text-white/20">·</span>
        <span className="text-sm text-muted-foreground">{examLabel}</span>
      </div>

      {/* Assignment bar */}
      <AssignmentBar
        questionId={id}
        reviewerName={reviewerName}
        expiresAt={expiresAt}
      />

      {/* Layout side-by-side */}
      <div className="flex gap-4 min-h-[calc(100vh-200px)]">
        {/* Painel esquerdo — conteúdo da questão */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-base font-semibold text-foreground">
                Questão {question.question_no}
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                {question.has_image && (
                  <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-400">
                    Imagem
                  </span>
                )}
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[question.status ?? 'extracted'] ?? STATUS_CLASSES.extracted}`}>
                  {STATUS_LABELS[question.status ?? 'extracted'] ?? question.status}
                </span>
                {question.confidence_score !== null && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {Math.round((question.confidence_score ?? 0) * 100)}% confiança
                  </span>
                )}
              </div>
            </div>

            {/* Enunciado */}
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {question.stem ?? '(sem enunciado)'}
            </p>

            {/* Alternativas */}
            <div className="flex flex-col gap-2 mt-2">
              {ALTERNATIVES.map((letter) => {
                const text = altMap[letter]
                if (!text) return null
                const isCorrect = question.correct_answer === letter
                return (
                  <div
                    key={letter}
                    className={`flex gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                      isCorrect
                        ? 'border-green-500/30 bg-green-500/10'
                        : 'border-white/5 bg-white/2'
                    }`}
                  >
                    <span className={`font-semibold shrink-0 ${isCorrect ? 'text-green-400' : 'text-muted-foreground'}`}>
                      {letter})
                    </span>
                    <span className={isCorrect ? 'text-green-300' : 'text-foreground'}>{text}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Painel direito — ações (Sessão 3.2) */}
        <div className="w-72 shrink-0 flex flex-col gap-4">
          <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">Ações</h3>
            <p className="text-xs text-muted-foreground">
              Aprovar, corrigir, rejeitar e classificar estão disponíveis na Sessão 3.2.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
