import { registerHandler } from '@/lib/queue/worker'
import { generateTeacherTips } from '@/lib/extrator/core/pipeline'

/**
 * Job 'teacher_tips': gera a "Dica para o professor" de uma questão.
 * Enfileirado em lote por /api/teacher-tips; processado pelo worker tick.
 */
registerHandler('teacher_tips', async (job) => {
  if (!job.question_id) throw new Error('teacher_tips: question_id ausente')
  const res = await generateTeacherTips(job.question_id)
  if (res.status === 'error') {
    throw new Error(`Falha ao gerar dica do professor (q=${job.question_id})`)
  }
})
