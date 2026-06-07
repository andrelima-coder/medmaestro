-- ============================================================================
-- 017_simulado_questions_unique_question
-- ----------------------------------------------------------------------------
-- Restaura a UNIQUE(simulado_id, question_id) prevista no schema 001 mas
-- ausente em produção (a tabela divergiu). Sem ela, a mesma questão podia ser
-- adicionada 2x ao mesmo simulado.
--
-- Pré-requisito verificado: sem duplicatas existentes em prod (2026-06-06).
-- Idempotente: só cria se ainda não existir uma UNIQUE cobrindo essas colunas.
-- NÃO-deferrable (question_id não é permutado, ao contrário de position).
-- ============================================================================

DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
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
      ) = ARRAY['question_id', 'simulado_id']
  ) INTO v_exists;

  IF NOT v_exists THEN
    ALTER TABLE public.simulado_questions
      ADD CONSTRAINT simulado_questions_simulado_question_key
      UNIQUE (simulado_id, question_id);
  END IF;
END $$;
