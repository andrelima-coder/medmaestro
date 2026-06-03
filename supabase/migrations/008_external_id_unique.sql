-- 008_external_id_unique.sql
-- Unicidade de questions.external_id (idempotência da importação do compilado).
-- UNIQUE no Postgres permite múltiplos NULL, então convive com as questões
-- extraídas pelo pipeline (external_id NULL). Idempotente.

-- Remove índice parcial anterior, se existir (versão inicial usava WHERE).
DROP INDEX IF EXISTS public.questions_external_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.questions'::regclass
      AND conname  = 'questions_external_id_uniq'
  ) THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_external_id_uniq UNIQUE (external_id);
  END IF;
END $$;
