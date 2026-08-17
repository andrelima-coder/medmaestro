import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Uma questão fica "travada" para revelação de gabarito enquanto o aluno tem um
 * simulado EM ANDAMENTO que a contém.
 *
 * Motivação (auditoria de segurança 2026-08-15, P0 — simulado ranqueado):
 * `recordPracticeAction` (prática avulsa) e `revisarRevelarAction` (revisão SRS)
 * devolvem `correct_answer` de qualquer questão só com sessão. Como o simulado
 * usa as mesmas questões, sem esta trava o aluno chama uma dessas ações com o id
 * da questão atual DURANTE a prova cronometrada e obtém o gabarito na hora,
 * burlando nota/ranking. Aqui bloqueamos exatamente esse caminho.
 *
 * Recebe o client service-role (as ações do aluno já o usam) porque precisa
 * cruzar os attempts do usuário com o molde de simulado da campanha.
 */
export async function isQuestionLockedByActiveExam(
  service: SupabaseClient,
  userId: string,
  questionId: string
): Promise<boolean> {
  // 1) Simulados que o usuário tem EM ANDAMENTO (via a campanha do attempt).
  const { data: attempts } = await service
    .from('simulado_attempts')
    .select('campaigns!inner(simulado_id)')
    .eq('user_id', userId)
    .eq('status', 'em_andamento')

  const simuladoIds = [
    ...new Set(
      ((attempts ?? []) as unknown as { campaigns: { simulado_id: string | null } | null }[])
        .map((a) => a.campaigns?.simulado_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  if (simuladoIds.length === 0) return false

  // 2) A questão pertence a algum desses simulados?
  const { data: hit } = await service
    .from('simulado_questions')
    .select('id')
    .in('simulado_id', simuladoIds)
    .eq('question_id', questionId)
    .limit(1)
    .maybeSingle()

  return Boolean(hit)
}
