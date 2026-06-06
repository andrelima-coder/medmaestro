-- 014_simulado_sampling.sql
-- Otimização do fluxo "Gerar simulado": contagem (facets) e amostragem
-- estratificada feitas no Postgres, evitando carregar o pool inteiro no servidor.
--
-- Introduz _questions_filtered() como FONTE ÚNICA do predicado de filtro do
-- Banco de Questões. search_questions() passa a consumi-la (mesma semântica),
-- e search_questions_facets() / sample_questions() reusam o mesmo predicado.

-- ----------------------------------------------------------------------------
-- Fonte única do predicado de filtro. Mesma semântica de search_questions:
--   * OU dentro de uma dimensão (slug = ANY(array))
--   * E entre dimensões (EXISTS encadeados)
--   * arrays vazios = sem filtro; filtra por SLUG.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _questions_filtered(
  p_modulo        text[] DEFAULT '{}',
  p_tema          text[] DEFAULT '{}',
  p_tipo          text[] DEFAULT '{}',
  p_recurso       text[] DEFAULT '{}',
  p_dificuldade   text[] DEFAULT '{}',
  p_banca         text[] DEFAULT '{}',
  p_year          int[]  DEFAULT '{}',
  p_status        text[] DEFAULT '{}',
  p_classificacao text   DEFAULT NULL,
  p_search        text   DEFAULT NULL
)
RETURNS TABLE(id uuid, question_number int, year int)
LANGUAGE sql
STABLE
AS $$
  SELECT q.id, q.question_number::int, e.year::int
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
    );
$$;

-- ----------------------------------------------------------------------------
-- search_questions: agora consome _questions_filtered (mesma saída de antes).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_questions(
  p_modulo        text[] DEFAULT '{}',
  p_tema          text[] DEFAULT '{}',
  p_tipo          text[] DEFAULT '{}',
  p_recurso       text[] DEFAULT '{}',
  p_dificuldade   text[] DEFAULT '{}',
  p_banca         text[] DEFAULT '{}',
  p_year          int[]  DEFAULT '{}',
  p_status        text[] DEFAULT '{}',
  p_classificacao text   DEFAULT NULL,
  p_search        text   DEFAULT NULL,
  p_limit         int    DEFAULT 20,
  p_offset        int    DEFAULT 0
)
RETURNS TABLE(total bigint, rows jsonb)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT * FROM _questions_filtered(
      p_modulo, p_tema, p_tipo, p_recurso, p_dificuldade,
      p_banca, p_year, p_status, p_classificacao, p_search)
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

-- ----------------------------------------------------------------------------
-- search_questions_facets: total + contagens por dimensão (dificuldade, modulo).
-- Usado na tela /simulados/gerar sem carregar enunciados.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_questions_facets(
  p_modulo        text[] DEFAULT '{}',
  p_tema          text[] DEFAULT '{}',
  p_tipo          text[] DEFAULT '{}',
  p_recurso       text[] DEFAULT '{}',
  p_dificuldade   text[] DEFAULT '{}',
  p_banca         text[] DEFAULT '{}',
  p_year          int[]  DEFAULT '{}',
  p_status        text[] DEFAULT '{}',
  p_classificacao text   DEFAULT NULL,
  p_search        text   DEFAULT NULL
)
RETURNS TABLE(total bigint, facets jsonb)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT id FROM _questions_filtered(
      p_modulo, p_tema, p_tipo, p_recurso, p_dificuldade,
      p_banca, p_year, p_status, p_classificacao, p_search)
  ),
  dims AS (
    SELECT t.dimension, t.label, count(*) AS cnt
    FROM filtered f
    JOIN question_tags qt ON qt.question_id = f.id
    JOIN tags t ON t.id = qt.tag_id
    WHERE t.dimension IN ('dificuldade', 'modulo')
    GROUP BY t.dimension, t.label
  ),
  grouped AS (
    SELECT dimension,
           jsonb_agg(jsonb_build_object('label', label, 'count', cnt) ORDER BY cnt DESC) AS arr
    FROM dims
    GROUP BY dimension
  )
  SELECT
    (SELECT count(*) FROM filtered) AS total,
    COALESCE((SELECT jsonb_object_agg(dimension, arr) FROM grouped), '{}'::jsonb) AS facets;
$$;

-- ----------------------------------------------------------------------------
-- sample_questions: retorna apenas os IDs já sorteados, respeitando quantidade
-- e modo de distribuição (random | dificuldade | modulo) — tudo no banco.
-- Estratificado: cota por bucket ~ proporcional ao tamanho do bucket (>=1),
-- com corte final aleatório em p_total. DISTINCT ON evita duplicar questões
-- com mais de uma tag na dimensão.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sample_questions(
  p_modulo        text[] DEFAULT '{}',
  p_tema          text[] DEFAULT '{}',
  p_tipo          text[] DEFAULT '{}',
  p_recurso       text[] DEFAULT '{}',
  p_dificuldade   text[] DEFAULT '{}',
  p_banca         text[] DEFAULT '{}',
  p_year          int[]  DEFAULT '{}',
  p_status        text[] DEFAULT '{}',
  p_classificacao text   DEFAULT NULL,
  p_search        text   DEFAULT NULL,
  p_total         int    DEFAULT 20,
  p_mode          text   DEFAULT 'random'
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_dim text;
BEGIN
  IF p_mode IN ('dificuldade', 'modulo') THEN
    v_dim := p_mode;
    RETURN QUERY
    WITH filtered AS (
      SELECT f.id FROM _questions_filtered(
        p_modulo, p_tema, p_tipo, p_recurso, p_dificuldade,
        p_banca, p_year, p_status, p_classificacao, p_search) f
    ),
    bucketed AS (
      SELECT DISTINCT ON (f.id) f.id, COALESCE(t.label, '—') AS bucket
      FROM filtered f
      LEFT JOIN question_tags qt ON qt.question_id = f.id
      LEFT JOIN tags t ON t.id = qt.tag_id AND t.dimension::text = v_dim
      ORDER BY f.id, t.display_order NULLS LAST, t.label
    ),
    ranked AS (
      SELECT b.id,
             row_number() OVER (PARTITION BY b.bucket ORDER BY random()) AS rn,
             count(*)     OVER (PARTITION BY b.bucket) AS bucket_n,
             count(*)     OVER () AS total_n
      FROM bucketed b
    )
    SELECT r.id FROM ranked r
    WHERE r.rn <= GREATEST(1, round(p_total::numeric * r.bucket_n / NULLIF(r.total_n, 0)))
    ORDER BY random()
    LIMIT p_total;
  ELSE
    RETURN QUERY
    SELECT f.id
    FROM _questions_filtered(
      p_modulo, p_tema, p_tipo, p_recurso, p_dificuldade,
      p_banca, p_year, p_status, p_classificacao, p_search) f
    ORDER BY random()
    LIMIT p_total;
  END IF;
END;
$$;
