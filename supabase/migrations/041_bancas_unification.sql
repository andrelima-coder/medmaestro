-- 041_bancas_unification.sql
--
-- Unificação do conceito de "banca": existiam duas tabelas paralelas sem FK
-- entre si — `exam_boards` (legada, usada por todo o pipeline de curadoria:
-- exams, taxonomies, search_questions/sample_questions, montagem de
-- campanha) e `bancas` (nova, criada fora do histórico de migrations deste
-- repo, já usada por `exams.banca_id` — 15/15 linhas já migradas — e
-- parcialmente por `tags.banca_id` — 73/89 já preenchidas).
--
-- Decisão (2026-08-14): unificar em `bancas`. `exam_boards`/`*.board_id`
-- ficam como legado por enquanto — não dropar nesta migration.
--
-- Semântica de tags.banca_id (já em uso, preservada aqui, não alterada):
--   NULL      = tag compartilhada entre todas as bancas
--               (ex: dimension tipo_questao, recurso_visual, dificuldade —
--               propriedades da questão, não do currículo).
--   preenchido = tag específica da ementa/currículo daquela banca
--               (ex: dimension modulo, topico_edital).
-- Esta migration NÃO faz backfill dos 16 tags com banca_id NULL — são
-- compartilhados por desenho, não pendência.

-- 1. taxonomies passa a apontar pra bancas também (aditivo; board_id fica).
ALTER TABLE taxonomies ADD COLUMN IF NOT EXISTS banca_id uuid REFERENCES bancas(id);

CREATE INDEX IF NOT EXISTS idx_taxonomies_banca ON taxonomies (banca_id);
CREATE INDEX IF NOT EXISTS idx_tags_banca ON tags (banca_id);

COMMENT ON COLUMN tags.banca_id IS
  'NULL = tag compartilhada entre todas as bancas (ex: tipo_questao, recurso_visual, dificuldade). Preenchido = tag específica do currículo/ementa daquela banca (ex: modulo, topico_edital). Não "corrigir" os NULLs — são intencionais.';

-- 2. Backfill: as 2 taxonomias existentes (medmaestro_v1, edital_temi_amib_2026)
-- foram criadas para a AMIB/TEMI — único banca hoje nos dois lados.
DO $$
DECLARE
  v_banca_id uuid;
  v_updated  int;
BEGIN
  SELECT id INTO v_banca_id FROM bancas WHERE slug = 'temi';
  IF v_banca_id IS NULL THEN
    RAISE EXCEPTION 'banca "temi" não encontrada em bancas — abortando backfill de taxonomies.banca_id';
  END IF;

  UPDATE taxonomies
  SET banca_id = v_banca_id
  WHERE banca_id IS NULL
    AND board_id IN (SELECT id FROM exam_boards WHERE slug = 'amib');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'taxonomies.banca_id preenchido em % linha(s)', v_updated;
END $$;

-- 3. Reescreve _questions_filtered pra filtrar banca via `bancas`/`exams.banca_id`
-- (em vez de `exam_boards`/`exams.board_id`), e escopar os filtros de tag por
-- banca respeitando a semântica NULL=compartilhada acima.
CREATE OR REPLACE FUNCTION public._questions_filtered(
  p_modulo text[] DEFAULT '{}'::text[],
  p_tema text[] DEFAULT '{}'::text[],
  p_tipo text[] DEFAULT '{}'::text[],
  p_recurso text[] DEFAULT '{}'::text[],
  p_dificuldade text[] DEFAULT '{}'::text[],
  p_banca text[] DEFAULT '{}'::text[],
  p_year integer[] DEFAULT '{}'::integer[],
  p_status text[] DEFAULT '{}'::text[],
  p_classificacao text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_formato text[] DEFAULT '{}'::text[]
)
RETURNS TABLE(id uuid, question_number integer, year integer)
LANGUAGE sql
STABLE
AS $function$
  SELECT q.id, q.question_number::int, e.year::int
  FROM questions q
  JOIN exams e ON e.id = q.exam_id
  LEFT JOIN bancas bc ON bc.id = e.banca_id
  CROSS JOIN LATERAL (
    SELECT array_agg(bc2.id) AS ids
    FROM bancas bc2
    WHERE cardinality(p_banca) = 0 OR bc2.slug = ANY(p_banca)
  ) banca_scope
  WHERE
    (cardinality(p_year)  = 0 OR e.year = ANY(p_year))
    AND (cardinality(p_banca) = 0 OR bc.slug = ANY(p_banca))
    AND (cardinality(p_status) = 0 OR q.status::text = ANY(p_status))
    AND (cardinality(p_formato) = 0 OR COALESCE(e.source_format, 'pdf') = ANY(p_formato))
    AND (p_search IS NULL OR p_search = '' OR q.stem ILIKE '%' || p_search || '%')
    AND (cardinality(p_modulo) = 0 OR EXISTS (
          SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
          WHERE qt.question_id = q.id AND t.dimension = 'modulo' AND t.slug = ANY(p_modulo)
            AND (t.banca_id IS NULL OR t.banca_id = ANY(banca_scope.ids))))
    AND (cardinality(p_tema) = 0 OR EXISTS (
          SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
          WHERE qt.question_id = q.id AND t.dimension = 'topico_edital' AND t.slug = ANY(p_tema)
            AND (t.banca_id IS NULL OR t.banca_id = ANY(banca_scope.ids))))
    AND (cardinality(p_tipo) = 0 OR EXISTS (
          SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
          WHERE qt.question_id = q.id AND t.dimension = 'tipo_questao' AND t.slug = ANY(p_tipo)
            AND (t.banca_id IS NULL OR t.banca_id = ANY(banca_scope.ids))))
    AND (cardinality(p_recurso) = 0 OR EXISTS (
          SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
          WHERE qt.question_id = q.id AND t.dimension = 'recurso_visual' AND t.slug = ANY(p_recurso)
            AND (t.banca_id IS NULL OR t.banca_id = ANY(banca_scope.ids))))
    AND (cardinality(p_dificuldade) = 0 OR EXISTS (
          SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
          WHERE qt.question_id = q.id AND t.dimension = 'dificuldade' AND t.slug = ANY(p_dificuldade)
            AND (t.banca_id IS NULL OR t.banca_id = ANY(banca_scope.ids))))
    AND (
      p_classificacao IS NULL
      OR (p_classificacao = 'classificadas' AND EXISTS (
            SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
            WHERE qt.question_id = q.id AND t.dimension = 'modulo'))
      OR (p_classificacao = 'nao' AND NOT EXISTS (
            SELECT 1 FROM question_tags qt JOIN tags t ON t.id = qt.tag_id
            WHERE qt.question_id = q.id AND t.dimension = 'modulo'))
    );
$function$;

-- 4. search_questions: troca o LEFT JOIN de exibição pra bancas/nome_curto.
-- sample_questions não precisa mudar — delega tudo pra _questions_filtered.
CREATE OR REPLACE FUNCTION public.search_questions(
  p_modulo text[] DEFAULT '{}'::text[],
  p_tema text[] DEFAULT '{}'::text[],
  p_tipo text[] DEFAULT '{}'::text[],
  p_recurso text[] DEFAULT '{}'::text[],
  p_dificuldade text[] DEFAULT '{}'::text[],
  p_banca text[] DEFAULT '{}'::text[],
  p_year integer[] DEFAULT '{}'::integer[],
  p_status text[] DEFAULT '{}'::text[],
  p_classificacao text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_formato text[] DEFAULT '{}'::text[]
)
RETURNS TABLE(total bigint, rows jsonb)
LANGUAGE sql
STABLE
AS $function$
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
            'board', bc.nome_curto,
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
        LEFT JOIN bancas bc ON bc.id = e.banca_id
      ) sub
    ), '[]'::jsonb) AS rows;
$function$;

-- Fora do escopo desta migration (aplicação, não banco — listar pra revisão):
--   src/app/(dashboard)/questoes/page.tsx:117
--     .from('exam_boards').select('slug, short_name')  ->  .from('bancas').select('slug, nome_curto')
--     (o filtro "Banca" do /questoes vai continuar oferecendo só "AMIB" até essa troca)
--   src/app/(dashboard)/campanhas/actions.ts:226
--     .select('id, year, specialties(name), exam_boards(short_name)')  ->  trocar exam_boards por bancas(nome_curto)
--   src/app/(dashboard)/simulados/actions.ts:~558 (searchQuestionsForSimulado)
--     .select('..., exams!left(year, booklet_color, exam_boards(short_name))')  ->  idem
-- exam_boards/board_id ficam intocados (legado) até confirmar que nada mais depende deles.
