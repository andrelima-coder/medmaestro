-- ============================================================================
-- 015_simulado_reorder_atomic
-- ----------------------------------------------------------------------------
-- Corrige o P0 "Simulados quebrados em prod": reordenar/remover questão de um
-- simulado existente violava UNIQUE(simulado_id, position).
--
-- Causa: a constraint era NÃO-deferrable (checagem imediata, por-statement) e as
-- server actions gravavam posições em paralelo (Promise.all = transações HTTP
-- autocommit independentes). Qualquer estado intermediário com posição duplicada
-- estourava "duplicate key".
--
-- Correção em duas partes:
--   1. Tornar a constraint DEFERRABLE INITIALLY DEFERRED — a unicidade passa a
--      ser checada no COMMIT, permitindo permutas dentro de uma transação.
--   2. RPCs atômicas que reordenam/resequenciam em UM único statement dentro de
--      uma única transação (chamada .rpc() do supabase-js = 1 transação).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Constraint UNIQUE(simulado_id, position) -> DEFERRABLE INITIALLY DEFERRED
--    O nome é auto-gerado pelo Postgres; localizamos via pg_constraint para ser
--    robusto a variações de nome.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_conname text;
BEGIN
  -- Localiza a UNIQUE que cobre exatamente (simulado_id, position),
  -- independentemente da ordem das colunas dentro da constraint.
  SELECT con.conname
    INTO v_conname
  FROM pg_constraint con
  JOIN pg_class rel     ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'simulado_questions'
    AND nsp.nspname = 'public'
    AND con.contype = 'u'
    AND (
      SELECT array_agg(att.attname::text ORDER BY att.attname::text)
      FROM unnest(con.conkey) AS k(attnum)
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
    ) = ARRAY['position', 'simulado_id'];

  IF v_conname IS NULL THEN
    RAISE EXCEPTION 'Constraint UNIQUE(simulado_id, position) não encontrada em simulado_questions';
  END IF;

  EXECUTE format('ALTER TABLE public.simulado_questions DROP CONSTRAINT %I', v_conname);
END $$;

ALTER TABLE public.simulado_questions
  ADD CONSTRAINT simulado_questions_simulado_position_key
  UNIQUE (simulado_id, position)
  DEFERRABLE INITIALLY DEFERRED;

-- ----------------------------------------------------------------------------
-- 2a. reorder_simulado_questions: aplica a ordem exata recebida (drag-and-drop
--     e setas up/down). Renumera 1..n a partir do array de IDs, em um único
--     UPDATE. Posições de IDs não pertencentes ao simulado são ignoradas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reorder_simulado_questions(
  p_simulado_id uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
  UPDATE simulado_questions sq
  SET position = o.ord
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, ord)
  WHERE sq.id = o.id
    AND sq.simulado_id = p_simulado_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2b. resequence_simulado_questions: renumera 1..n por ordem de position atual,
--     fechando buracos. Usado após remoção de questão. Único UPDATE atômico.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resequence_simulado_questions(
  p_simulado_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
  UPDATE simulado_questions sq
  SET position = r.rn
  FROM (
    SELECT id, row_number() OVER (ORDER BY position, created_at) AS rn
    FROM simulado_questions
    WHERE simulado_id = p_simulado_id
  ) r
  WHERE sq.id = r.id
    AND sq.simulado_id = p_simulado_id
    AND sq.position <> r.rn;  -- evita no-op updates
END;
$$;
