-- 030_recalc_calibration.sql
--
-- Feature: 001-camada-aluno-simulados (Fase 1) — T024 (job de calibração).
-- Recalcula no Postgres (eficiente) a dificuldade empírica, a distribuição por
-- alternativa e sinaliza candidatos a erro de gabarito (distrator dominante).
-- Idempotente; chamada via service-role pelo painel/worker.

CREATE OR REPLACE FUNCTION recalc_calibration(min_responses int DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1) Dificuldade empírica por questão (p = acertos / respostas).
  INSERT INTO question_stats (question_id, empirical_difficulty, response_count, is_reliable, updated_at)
  SELECT qa.question_id,
         ROUND(
           (COUNT(*) FILTER (WHERE qa.selected_alt = q.correct_answer))::numeric
           / NULLIF(COUNT(*), 0), 3),
         COUNT(*),
         COUNT(*) >= min_responses,
         now()
  FROM question_attempts qa
  JOIN questions q ON q.id = qa.question_id
  WHERE qa.selected_alt IS NOT NULL
  GROUP BY qa.question_id
  ON CONFLICT (question_id) DO UPDATE
    SET empirical_difficulty = EXCLUDED.empirical_difficulty,
        response_count       = EXCLUDED.response_count,
        is_reliable          = EXCLUDED.is_reliable,
        updated_at           = now();

  -- 2) Distribuição por (questão, campanha).
  INSERT INTO question_answer_distribution (question_id, campaign_id, counts)
  SELECT question_id, campaign_id, jsonb_object_agg(selected_alt, c)
  FROM (
    SELECT qa.question_id, sa.campaign_id, qa.selected_alt, COUNT(*) AS c
    FROM question_attempts qa
    JOIN simulado_attempts sa ON sa.id = qa.attempt_id
    WHERE qa.selected_alt IS NOT NULL
    GROUP BY qa.question_id, sa.campaign_id, qa.selected_alt
  ) t
  GROUP BY question_id, campaign_id
  ON CONFLICT (question_id, campaign_id) DO UPDATE
    SET counts = EXCLUDED.counts;

  -- 3) Candidatos a erro de gabarito: alternativa mais votada != gabarito,
  --    com volume suficiente. Não duplica flag aberta da mesma questão.
  INSERT INTO gabarito_flags (question_id, reason, status)
  SELECT top.question_id,
         'distrator_dominante: ' || top.top_alt || ' supera gabarito ' || COALESCE(top.correct_answer, '?'),
         'aberto'
  FROM (
    SELECT DISTINCT ON (per.question_id)
           per.question_id, per.correct_answer, per.selected_alt AS top_alt
    FROM (
      SELECT qa.question_id, q.correct_answer, qa.selected_alt, COUNT(*) AS c
      FROM question_attempts qa
      JOIN questions q ON q.id = qa.question_id
      WHERE qa.selected_alt IS NOT NULL
      GROUP BY qa.question_id, q.correct_answer, qa.selected_alt
    ) per
    ORDER BY per.question_id, per.c DESC
  ) top
  JOIN (
    SELECT question_id, COUNT(*) AS total
    FROM question_attempts
    WHERE selected_alt IS NOT NULL
    GROUP BY question_id
  ) tot ON tot.question_id = top.question_id
  WHERE tot.total >= min_responses
    AND top.correct_answer IS NOT NULL
    AND top.top_alt <> top.correct_answer
    AND NOT EXISTS (
      SELECT 1 FROM gabarito_flags g
      WHERE g.question_id = top.question_id
        AND g.status = 'aberto'
        AND g.reason LIKE 'distrator_dominante%'
    );
END;
$$;

COMMENT ON FUNCTION recalc_calibration(int) IS
  'Recalcula dificuldade empírica, distribuição por alternativa e flags de gabarito. Idempotente.';
