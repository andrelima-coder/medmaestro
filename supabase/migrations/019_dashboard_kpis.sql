-- 019_dashboard_kpis.sql
-- KPIs do Dashboard com contagem de QUESTÕES DISTINTAS.
--
-- Bug corrigido: os cards "Classificadas" e "Comentadas" contavam linhas de
-- question_tags / question_comments (relações m2m). Como cada questão tem
-- várias tags e pode ter mais de um comentário, "Classificadas" chegava a
-- 6.372 (= total de tags) sobre 1.271 questões = 501% do total.
--
-- COUNT(DISTINCT question_id) resolve no servidor numa única linha, sem
-- esbarrar no limite de 1000 linhas do PostgREST que ocorreria ao contar no
-- cliente.

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis()
RETURNS TABLE (
  total_questoes bigint,
  classificadas bigint,
  comentadas   bigint,
  provas       bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)                       FROM questions)         AS total_questoes,
    (SELECT COUNT(DISTINCT question_id)    FROM question_tags)     AS classificadas,
    (SELECT COUNT(DISTINCT question_id)    FROM question_comments) AS comentadas,
    (SELECT COUNT(*)                       FROM exams)             AS provas;
$$;

COMMENT ON FUNCTION public.get_dashboard_kpis() IS
  'KPIs do dashboard: questões totais e nº de questões DISTINTAS classificadas/comentadas (não linhas de tags/comentários).';

GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis() TO authenticated, service_role;
