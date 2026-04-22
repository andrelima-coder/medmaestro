'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

type ExamStatus = 'pending' | 'extracting' | 'done' | 'error'

type Exam = {
  id: string
  status: ExamStatus
  year: number
  booklet_color: string | null
  specialties: { name: string } | null
}

const STATUS_LABELS: Record<ExamStatus, string> = {
  pending: 'Aguardando',
  extracting: 'Extraindo',
  done: 'Concluído',
  error: 'Erro',
}

const STATUS_CLASSES: Record<ExamStatus, string> = {
  pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  extracting: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  done: 'bg-green-500/15 text-green-400 border-green-500/30',
  error: 'bg-destructive/15 text-destructive border-destructive/30',
}

export function ExamProgress({
  exam,
  initialCount,
}: {
  exam: Exam
  initialCount: number
}) {
  const [status, setStatus] = useState<ExamStatus>(exam.status)
  const [count, setCount] = useState(initialCount)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function triggerExtraction() {
    setTriggering(true)
    setExtractError(null)
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_WORKER_SECRET ?? ''}`,
        },
        body: JSON.stringify({ exam_id: exam.id }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string; questions_created?: number }
      if (!data.ok) setExtractError(data.error ?? 'Erro desconhecido')
      else setCount(data.questions_created ?? count)
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : String(err))
    } finally {
      setTriggering(false)
    }
  }

  // Auto-dispara extração se status é pending
  useEffect(() => {
    if (exam.status === 'pending') {
      triggerExtraction()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Supabase Realtime — escuta mudanças no exame
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`exam-${exam.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'exams', filter: `id=eq.${exam.id}` },
        (payload) => {
          const newStatus = (payload.new as { status: ExamStatus }).status
          setStatus(newStatus)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [exam.id])

  // Poll do count de questões durante extração
  useEffect(() => {
    if (status !== 'extracting') {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    const supabase = createClient()
    pollRef.current = setInterval(async () => {
      const { count: newCount } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('exam_id', exam.id)
      if (newCount !== null) setCount(newCount)
    }, 3000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [status, exam.id])

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div className="rounded-xl border border-white/7 bg-[var(--mm-surface)]/60 backdrop-blur-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {exam.specialties?.name ?? 'Especialidade'} · {exam.year}
              {exam.booklet_color ? ` · ${exam.booklet_color.charAt(0).toUpperCase() + exam.booklet_color.slice(1)}` : ''}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p>
            <p className="text-xs text-muted-foreground">questões extraídas</p>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
          >
            {status === 'extracting' && (
              <span className="size-1.5 animate-pulse rounded-full bg-current" />
            )}
            {STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      {extractError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {extractError}
        </div>
      )}

      <div className="flex gap-3">
        {status === 'done' && (
          <Button render={<a href={`/questoes?exam_id=${exam.id}`} />}>Ver questões</Button>
        )}
        {(status === 'error' || (status === 'done' && extractError)) && (
          <Button variant="outline" onClick={triggerExtraction} disabled={triggering}>
            {triggering ? 'Tentando...' : 'Tentar novamente'}
          </Button>
        )}
        <Button variant="ghost" render={<a href="/lotes" />}>Voltar aos lotes</Button>
      </div>
    </div>
  )
}
