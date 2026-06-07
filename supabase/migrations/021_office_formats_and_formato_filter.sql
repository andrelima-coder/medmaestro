-- 021_office_formats_and_formato_filter.sql
--
-- (a) Suporte a cadernos Office (DOCX/PPTX): novas colunas em `exams` para
--     rastrear o formato de origem e o caminho do arquivo original (o
--     `source_pdf_path` passa a guardar o PDF derivado/convertido).
-- (b) Libera DOCX/PPTX/TXT/MD no bucket `exam-pdfs` e sobe o limite para ~105MB
--     (antes 50MB e só application/pdf — o que já bloquearia gabarito DOCX).
-- (c) Adiciona o filtro `p_formato` ao chokepoint `_questions_filtered` (e o
--     propaga por sample_questions / search_questions), alimentando o novo
--     filtro "Formato" das listagens.
--
-- Aditivo e retrocompatível: o frontend atual chama as RPCs por argumentos
-- nomeados sem p_formato, que tem DEFAULT '{}' (= sem filtro).

-- ── (a) Colunas de formato ──────────────────────────────────────────────────
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS source_format        text NOT NULL DEFAULT 'pdf',
  ADD COLUMN IF NOT EXISTS source_original_path text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exams_source_format_check'
  ) THEN
    ALTER TABLE exams
      ADD CONSTRAINT exams_source_format_check
      CHECK (source_format IN ('pdf', 'docx', 'pptx'));
  END IF;
END $$;

COMMENT ON COLUMN exams.source_format IS
  'Formato do caderno enviado: pdf | docx | pptx. DOCX/PPTX são convertidos para PDF (source_pdf_path) na ingestão.';
COMMENT ON COLUMN exams.source_original_path IS
  'Caminho do arquivo original no bucket exam-pdfs quando o caderno veio em DOCX/PPTX (null para PDF).';

-- ── (b) Bucket exam-pdfs: formatos e tamanho ────────────────────────────────
UPDATE storage.buckets
SET file_size_limit   = 110100480, -- 105 MB (folga sobre o limite de 100MB do app)
    allowed_mime_types = ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/markdown',
      'application/octet-stream'
    ]
WHERE id = 'exam-pdfs';

-- ── (c) Filtro de formato no chokepoint + propagação ────────────────────────
-- DROP das assinaturas antigas antes de recriar com o novo parâmetro, para não
-- deixar overloads ambíguos para o PostgREST.
DROP FUNCTION IF EXISTS search_questions(text[],text[],text[],text[],text[],text[],int[],text[],text,text,int,int);
DROP FUNCTION IF EXISTS search_questions_facets(text[],text[],text[],text[],text[],text[],int[],text[],text,text);
DROP FUNCTION IF EXISTS sample_questions(text[],text[],text[],text[],text[],text[],int[],text[],text,text,int,text);
DROP FUNCTION IF EXISTS _questions_filtered(text[],text[],text[],text[],text[],text[],int[],text[],text,text);

CREATE FUNCTION _questions_filtered(
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
  p_formato       text[] DEFAULT '{}'
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
    AND (cardinality(p_formato) = 0 OR COALESCE(e.source_format, 'pdf') = ANY(p_formato))
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

CREATE FUNCTION sample_questions(
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
  p_mode          text   DEFAULT 'random',
  p_formato       text[] DEFAULT '{}'
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
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
        p_banca, p_year, p_status, p_classificacao, p_search, p_formato) f
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
      p_banca, p_year, p_status, p_classificacao, p_search, p_formato) f
    ORDER BY random()
    LIMIT p_total;
  END IF;
END;
$$;

CREATE FUNCTION search_questions(
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
  p_offset        int    DEFAULT 0,
  p_formato       text[] DEFAULT '{}'
)
RETURNS TABLE(total bigint, rows jsonb)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT * FROM _questions_filtered(
      p_modulo, p_tema, p_tipo, p_recurso, p_dificuldade,
      p_banca, p_year, p_status, p_classificacao, p_search, p_formato)
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

CREATE FUNCTION search_questions_facets(
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
  p_formato       text[] DEFAULT '{}'
)
RETURNS TABLE(total bigint, facets jsonb)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT id FROM _questions_filtered(
      p_modulo, p_tema, p_tipo, p_recurso, p_dificuldade,
      p_banca, p_year, p_status, p_classificacao, p_search, p_formato)
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
