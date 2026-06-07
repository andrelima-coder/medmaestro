-- ============================================================================
-- 016_fix_resequence_created_at
-- ----------------------------------------------------------------------------
-- Correção da migration 015: resequence_simulado_questions referenciava
-- simulado_questions.created_at como critério de desempate, mas essa coluna
-- NÃO existe na tabela em produção (divergiu do schema 001). Como `position`
-- é único por simulado_id, ele sozinho já é ordem determinística.
-- ============================================================================

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
    SELECT id, row_number() OVER (ORDER BY position) AS rn
    FROM simulado_questions
    WHERE simulado_id = p_simulado_id
  ) r
  WHERE sq.id = r.id
    AND sq.simulado_id = p_simulado_id
    AND sq.position <> r.rn;  -- evita no-op updates
END;
$$;
