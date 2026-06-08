-- 038_recalc_include_practice.sql
--
-- Feature: 003-estudo-recorrente (Fase 3) — B002
-- Estende recalc_calibration e recalc_analytics para incluir as respostas de
-- prática avulsa (practice_attempts), unidas às de simulado. Prática não tem
-- campanha (sem gating de gabarito). Idempotente; search_path fixo.
--
-- NB: a definição completa das funções está aqui (CREATE OR REPLACE) — esta
-- versão substitui a de 030/036.

CREATE OR REPLACE FUNCTION recalc_calibration(min_responses int DEFAULT 30)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  TRUNCATE question_stats;
  INSERT INTO question_stats (question_id, empirical_difficulty, response_count, is_reliable, updated_at)
  SELECT u.question_id,
         ROUND(SUM(CASE WHEN u.correct THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0), 3),
         COUNT(*), COUNT(*) >= min_responses, now()
  FROM (
    SELECT qa.question_id, (qa.selected_alt = q.correct_answer) AS correct
    FROM question_attempts qa JOIN questions q ON q.id = qa.question_id
    WHERE qa.selected_alt IS NOT NULL
    UNION ALL
    SELECT pa.question_id, pa.is_correct FROM practice_attempts pa
  ) u
  GROUP BY u.question_id;

  TRUNCATE question_answer_distribution;
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
  ON CONFLICT (question_id, campaign_id) DO UPDATE SET counts = EXCLUDED.counts;

  INSERT INTO gabarito_flags (question_id, reason, status)
  SELECT top.question_id,
         'distrator_dominante: ' || top.top_alt || ' supera gabarito ' || COALESCE(top.correct_answer, '?'),
         'aberto'
  FROM (
    SELECT DISTINCT ON (per.question_id) per.question_id, per.correct_answer, per.selected_alt AS top_alt
    FROM (
      SELECT z.question_id, z.correct_answer, z.selected_alt, COUNT(*) AS c
      FROM (
        SELECT qa.question_id, q.correct_answer, qa.selected_alt
        FROM question_attempts qa JOIN questions q ON q.id = qa.question_id
        WHERE qa.selected_alt IS NOT NULL
        UNION ALL
        SELECT pa.question_id, q.correct_answer, pa.selected_alt
        FROM practice_attempts pa JOIN questions q ON q.id = pa.question_id
        WHERE pa.selected_alt IS NOT NULL
      ) z
      GROUP BY z.question_id, z.correct_answer, z.selected_alt
    ) per
    ORDER BY per.question_id, per.c DESC
  ) top
  JOIN (
    SELECT question_id, COUNT(*) AS total FROM (
      SELECT question_id FROM question_attempts WHERE selected_alt IS NOT NULL
      UNION ALL SELECT question_id FROM practice_attempts WHERE selected_alt IS NOT NULL
    ) a GROUP BY question_id
  ) tot ON tot.question_id = top.question_id
  WHERE tot.total >= min_responses
    AND top.correct_answer IS NOT NULL
    AND top.top_alt <> top.correct_answer
    AND NOT EXISTS (
      SELECT 1 FROM gabarito_flags g
      WHERE g.question_id = top.question_id AND g.status = 'aberto' AND g.reason LIKE 'distrator_dominante%'
    );
END;
$$;

CREATE OR REPLACE FUNCTION recalc_analytics()
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  TRUNCATE student_module_stats;
  INSERT INTO student_module_stats (user_id, dimension, tag_id, tag_label, correct, total, updated_at)
  SELECT s.user_id, t.dimension::text, t.id, t.label,
         SUM(CASE WHEN s.correct THEN 1 ELSE 0 END), COUNT(*), now()
  FROM (
    SELECT sa.user_id, qa.question_id, (qa.selected_alt = q.correct_answer) AS correct
    FROM question_attempts qa
    JOIN simulado_attempts sa ON sa.id = qa.attempt_id
    JOIN campaigns c ON c.id = sa.campaign_id AND COALESCE((c.releases->>'nota_gabarito')::boolean, false) = true
    JOIN questions q ON q.id = qa.question_id
    WHERE qa.selected_alt IS NOT NULL
    UNION ALL
    SELECT pa.user_id, pa.question_id, pa.is_correct FROM practice_attempts pa
  ) s
  JOIN question_tags qt ON qt.question_id = s.question_id
  JOIN tags t ON t.id = qt.tag_id AND t.dimension IN ('modulo','topico_edital')
  GROUP BY s.user_id, t.dimension, t.id, t.label;

  TRUNCATE campaign_module_stats;
  INSERT INTO campaign_module_stats (campaign_id, dimension, tag_id, tag_label, correct, total)
  SELECT sa.campaign_id, t.dimension::text, t.id, t.label,
         COUNT(*) FILTER (WHERE qa.selected_alt = q.correct_answer), COUNT(*)
  FROM question_attempts qa
  JOIN simulado_attempts sa ON sa.id = qa.attempt_id
  JOIN questions q ON q.id = qa.question_id
  JOIN question_tags qt ON qt.question_id = q.id
  JOIN tags t ON t.id = qt.tag_id AND t.dimension IN ('modulo','topico_edital')
  WHERE qa.selected_alt IS NOT NULL
  GROUP BY sa.campaign_id, t.dimension, t.id, t.label;
END;
$$;
