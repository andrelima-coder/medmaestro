'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isQuestionLockedByActiveExam } from '@/lib/aluno/exam-lock'

// Revisão SRS por conceito (feature mentoria — porte do mentortemi-web).
// Duas etapas: revelar (mostra gabarito + comentários, sem gravar nada) e
// registrar (chama srs_registrar, que ajusta o intervalo do conceito).

const ROTULOS: Record<string, string> = {
  explicacao: 'Explicação',
  pegadinha: 'Pegadinha',
  referencia: 'Referência',
  mnemonico: 'Mnemônico',
  atualizacao_conduta: 'Atualização de conduta',
  dica_professor: 'Dica',
}

type RevelarResult =
  | { ok: true; data: { acerto: boolean; correctAnswer: string; comentarios: { tipo: string; content: string }[] } }
  | { ok: false; error: string }

export async function revisarRevelarAction(questionId: string, escolha: string): Promise<RevelarResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado.' }

  const service = createServiceClient()
  // Não revelar gabarito de questão que está num simulado em andamento do aluno
  // (burlaria a prova ranqueada).
  if (await isQuestionLockedByActiveExam(service, user.id, questionId)) {
    return { ok: false, error: 'Esta questão faz parte de um simulado em andamento — finalize-o antes de revisá-la.' }
  }
  const { data: q } = await service
    .from('questions')
    .select('correct_answer, question_comments(comment_type, content)')
    .eq('id', questionId)
    .eq('question_comments.status', 'published')
    .single()
  if (!q?.correct_answer) return { ok: false, error: 'Não foi possível carregar o gabarito.' }

  const comentarios = ((q.question_comments ?? []) as { comment_type: string | null; content: string }[]).map(
    (c) => ({ tipo: ROTULOS[c.comment_type ?? ''] ?? c.comment_type ?? '', content: c.content })
  )

  return {
    ok: true,
    data: { acerto: escolha === q.correct_answer, correctAnswer: q.correct_answer, comentarios },
  }
}

type RegistrarResult =
  | { ok: true; data: { pontosGanhos: number; proximaRevisao: string; pontoCego: boolean; skillProva: boolean } }
  | { ok: false; error: string }

export async function revisarRegistrarAction(
  conceitoId: string,
  questionId: string,
  acerto: boolean,
  confianca: number,
  tempoSeg: number,
  motivoErro: string | null
): Promise<RegistrarResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado.' }

  const { data, error } = await supabase.rpc('srs_registrar', {
    p_conceito_id: conceitoId,
    p_question_id: questionId,
    p_acerto: acerto,
    p_confianca: confianca,
    p_tempo_seg: tempoSeg,
    p_motivo_erro: motivoErro,
  })
  if (error) return { ok: false, error: 'Falha ao registrar: ' + error.message }

  const d = data as { pontos_ganhos: number; proxima_revisao: string; ponto_cego: boolean; skill_prova: boolean }
  return {
    ok: true,
    data: {
      pontosGanhos: d.pontos_ganhos,
      proximaRevisao: d.proxima_revisao,
      pontoCego: d.ponto_cego,
      skillProva: d.skill_prova,
    },
  }
}
