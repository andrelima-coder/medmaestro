-- fase2_assertions.sql
--
-- Feature: 002-analytics-desempenho — Fase 2 (A004), asserções SQL leves.
-- Rodar contra banco com as migrações 035/036 aplicadas:
--   psql "$DATABASE_URL" -f app/supabase/tests/fase2_assertions.sql

DO $$
BEGIN
  -- Tabelas agregadas existem e têm RLS.
  FOR i IN (SELECT unnest(ARRAY['student_module_stats','campaign_module_stats']) AS tbl) LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = i.tbl) THEN
      RAISE EXCEPTION 'FALHA: tabela ausente -> %', i.tbl;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = i.tbl) THEN
      RAISE EXCEPTION 'FALHA: RLS não habilitada em -> %', i.tbl;
    END IF;
  END LOOP;

  -- Função de materialização existe.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'recalc_analytics'
  ) THEN
    RAISE EXCEPTION 'FALHA: função recalc_analytics() ausente';
  END IF;

  -- Política do aluno (leitura do próprio) existe.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'student_module_stats' AND policyname = 'aluno_read_own_module_stats'
  ) THEN
    RAISE EXCEPTION 'FALHA: política aluno_read_own_module_stats ausente';
  END IF;

  RAISE NOTICE 'OK: asserções da Fase 2 passaram.';
END $$;
