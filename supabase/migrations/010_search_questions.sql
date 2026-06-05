-- 010_search_questions.sql
-- Função de busca/filtragem do Banco de Questões.
-- Substitui a filtragem feita em JS (interseção de Sets + .in(ids)) por uma
-- única query no banco, correta e escalável.
--
-- Semântica:
--   * OU dentro de uma dimensão (slug = ANY(array))
--   * E entre dimensões diferentes (EXISTS encadeados)
-- Arrays vazios = sem filtro naquela dimensão.
-- Filtra por SLUG (estável), não por label.
--
-- p_classificacao: NULL = todas | 'classificadas' = tem tag de módulo |
--                  'nao' = sem tag de módulo
--
-- Retorna 1 linha: total (contagem total filtrada) + rows (jsonb paginado).

CREATE OR REPLACE FUNCTION search_questions(
  p_modulo       text[] DEFAULT '{}',
  p_tema         text[] DEFAULT '{}',
  p_tipo         text[] DEFAULT '{}',
  p_recurso      text[] DEFAULT '{}',
  p_dificuldade  text[] DEFAULT '{}',
  p_banca        text[] DEFAULT '{}',
  p_year         int[]  DEFAULT '{}',
  p_status       text[] DEFAULT '{}',
  p_classificacao text  DEFAULT NULL,
  p_search       text   DEFAULT NULL,
  p_limit        int    DEFAULT 20,
  p_offset       int    DEFAULT 0
)
RETURNS TABLE(total bigint, rows jsonb)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT q.id, q.question_number, e.year
    FROM questions q
    JOIN exams e ON e.id = q.exam_id
    LEFT JOIN exam_boards b ON b.id = e.board_id
    WHERE
      (cardinality(p_year)  = 0 OR e.year = ANY(p_year))
      AND (cardinality(p_banca) = 0 OR b.slug = ANY(p_banca))
      AND (cardinality(p_status) = 0 OR q.status::text = ANY(p_status))
      AND (p_search IS NULL OR p_search = '' OR q.stem ILIKE '%' || p_search || '%')
      AND (cardinality(p_modulo) = 0 OR EXISTS (
            SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
            WHERE qt.question_id = q.id AND t.dimension = 'modulo' AND t.slug = ANY(p_modulo)))
      AND (cardinality(p_tema) = 0 OR EXISTS (
            SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
            WHERE qt.question_id = q.id AND t.dimension = 'topico_edital' AND t.slug = ANY(p_tema)))
      AND (cardinality(p_tipo) = 0 OR EXISTS (
            SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
            WHERE qt.question_id = q.id AND t.dimension = 'tipo_questao' AND t.slug = ANY(p_tipo)))
      AND (cardinality(p_recurso) = 0 OR EXISTS (
            SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
            WHERE qt.question_id = q.id AND t.dimension = 'recurso_visual' AND t.slug = ANY(p_recurso)))
      AND (cardinality(p_dificuldade) = 0 OR EXISTS (
            SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
            WHERE qt.question_id = q.id AND t.dimension = 'dificuldade' AND t.slug = ANY(p_dificuldade)))
      AND (
        p_classificacao IS NULL
        OR (p_classificacao = 'classificadas' AND EXISTS (
              SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
              WHERE qt.question_id = q.id AND t.dimension = 'modulo'))
        OR (p_classificacao = 'nao' AND NOT EXISTS (
              SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
              WHERE qt.question_id = q.id AND t.dimension = 'modulo'))
      )
  ),
  page AS (
    SELECT id FROM filtered
    ORDER BY year DESC, question_number ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    (SELECT count(*) FROM filtered) AS total,
    COALESCE((
      SELECT jsonb_agg(rd ORDER BY ord_year DESC, ord_qn ASC)
      FROM (
        SELECT
          e.year AS ord_year,
          q.question_number AS ord_qn,
          jsonb_build_object(
            'id', q.id,
            'question_number', q.question_number,
            'stem', left(COALESCE(q.stem, ''), 160),
            'stem_len', length(COALESCE(q.stem, '')),
            'status', q.status,
            'has_images', q.has_images,
            'correct_answer', q.correct_answer,
            'year', e.year,
            'board', b.short_name,
            'tags', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object('label', t.label, 'dimension', t.dimension, 'color', t.color)
                ORDER BY t.display_order NULLS LAST, t.label)
              FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
              WHERE qt.question_id = q.id
            ), '[]'::jsonb)
          ) AS rd
        FROM page
        JOIN questions q ON q.id = page.id
        JOIN exams e ON e.id = q.exam_id
        LEFT JOIN exam_boards b ON b.id = e.board_id
      ) sub
    ), '[]'::jsonb) AS rows;
$$;
