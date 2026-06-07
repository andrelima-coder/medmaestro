-- 036_recalc_analytics.sql
--
-- Feature: 002-analytics-desempenho (Fase 2) — A002
-- Materializa o desempenho por aluno e por campanha (dimensões modulo/topico_edital).
-- Só contabiliza campanhas com gabarito liberado (releases.nota_gabarito) — RN-04.
-- Idempotente; search_path fixo (advisor de segurança).

CREATE OR REPLACE FUNCTION recalc_analytics()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  TRUNCATE student_module_stats;
  INSERT INTO student_module_stats (user_id, dimension, tag_id, tag_label, correct, total, updated_at)
  SELECT sa.user_id, t.dimension::text, t.id, t.label,
         COUNT(*) FILTER (WHERE qa.selected_alt = q.correct_answer),
         COUNT(*),
         now()
  FROM question_attempts qa
  JOIN simulado_attempts sa ON sa.id = qa.attempt_id
  JOIN campaigns c ON c.id = sa.campaign_id
       AND COALESCE((c.releases->>'nota_gabarito')::boolean, false) = true
  JOIN questions q ON q.id = qa.question_id
  JOIN question_tags qt ON qt.question_id = q.id
  JOIN tags t ON t.id = qt.tag_id AND t.dimension IN ('modulo','topico_edital')
  WHERE qa.selected_alt IS NOT NULL
  GROUP BY sa.user_id, t.dimension, t.id, t.label;

  TRUNCATE campaign_module_stats;
  INSERT INTO campaign_module_stats (campaign_id, dimension, tag_id, tag_label, correct, total)
  SELECT sa.campaign_id, t.dimension::text, t.id, t.label,
         COUNT(*) FILTER (WHERE qa.selected_alt = q.correct_answer),
         COUNT(*)
  FROM question_attempts qa
  JOIN simulado_attempts sa ON sa.id = qa.attempt_id
  JOIN questions q ON q.id = qa.question_id
  JOIN question_tags qt ON qt.question_id = q.id
  JOIN tags t ON t.id = qt.tag_id AND t.dimension IN ('modulo','topico_edital')
  WHERE qa.selected_alt IS NOT NULL
  GROUP BY sa.campaign_id, t.dimension, t.id, t.label;
END;
$$;

COMMENT ON FUNCTION recalc_analytics() IS 'Materializa desempenho por aluno e por campanha (dimensões modulo/topico_edital). Idempotente.';
