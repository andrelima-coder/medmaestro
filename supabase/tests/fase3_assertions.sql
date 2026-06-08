-- fase3_assertions.sql
--
-- Feature: 003-estudo-recorrente — Fase 3 (B003), asserções SQL leves.
--   psql "$DATABASE_URL" -f app/supabase/tests/fase3_assertions.sql

DO $$
BEGIN
  FOR i IN (SELECT unnest(ARRAY['practice_attempts','student_goals','student_dismissed_cards']) AS tbl) LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = i.tbl) THEN
      RAISE EXCEPTION 'FALHA: tabela ausente -> %', i.tbl;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = i.tbl) THEN
      RAISE EXCEPTION 'FALHA: RLS não habilitada em -> %', i.tbl;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'practice_attempts' AND policyname = 'aluno_rw_own_practice'
  ) THEN
    RAISE EXCEPTION 'FALHA: política aluno_rw_own_practice ausente';
  END IF;

  -- recalc_calibration deve referenciar practice_attempts (prática alimenta calibração).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'recalc_calibration'
      AND pg_get_functiondef(oid) ILIKE '%practice_attempts%'
  ) THEN
    RAISE EXCEPTION 'FALHA: recalc_calibration não inclui practice_attempts';
  END IF;

  RAISE NOTICE 'OK: asserções da Fase 3 passaram.';
END $$;
