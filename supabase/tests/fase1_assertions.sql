-- fase1_assertions.sql
--
-- Feature: 001-camada-aluno-simulados — Fase 2 (Testes), adaptada (T008-T011).
-- O projeto não tem framework de testes; estas são asserções SQL leves para
-- validar, contra um banco de TESTE com as migrações 022-027 aplicadas, que a
-- estrutura e as regras de segurança estão no lugar.
--
-- Uso: psql "$DATABASE_URL_TESTE" -f app/supabase/tests/fase1_assertions.sql
-- Em caso de violação, o script aborta com RAISE EXCEPTION.

DO $$
BEGIN
  -- T008 (estrutura/RLS): tabelas novas existem e têm RLS habilitada.
  PERFORM 1;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'aluno'
  ) THEN
    RAISE EXCEPTION 'FALHA T001: enum user_role não contém o valor aluno';
  END IF;

  FOR i IN (
    SELECT unnest(ARRAY[
      'campaigns','campaign_form','simulado_attempts','question_attempts',
      'attempt_results','leads','lead_consents','conversion_events',
      'question_stats','question_answer_distribution','question_doubts','gabarito_flags'
    ]) AS tbl
  ) LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = i.tbl) THEN
      RAISE EXCEPTION 'FALHA estrutura: tabela ausente -> %', i.tbl;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = i.tbl) THEN
      RAISE EXCEPTION 'FALHA T008: RLS não habilitada em -> %', i.tbl;
    END IF;
  END LOOP;

  -- T009 (unicidade): constraint de tentativa única e dedup de lead.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'simulado_attempts_unique'
  ) THEN
    RAISE EXCEPTION 'FALHA T009: constraint simulado_attempts_unique ausente (tentativa única)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_unique_email_campaign'
  ) THEN
    RAISE EXCEPTION 'FALHA T009: constraint leads_unique_email_campaign ausente (dedup de lead)';
  END IF;

  -- T010 (cronômetro): coluna autoritativa de tempo restante existe e é NOT NULL.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'simulado_attempts' AND column_name = 'time_remaining'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'FALHA T010: simulado_attempts.time_remaining ausente ou nullable';
  END IF;

  -- T011 (gating): consentimento versionado/carimbado existe (base do gating LGPD).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_consents' AND column_name = 'consent_version'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_consents' AND column_name = 'consented_at'
  ) THEN
    RAISE EXCEPTION 'FALHA T011: lead_consents sem consent_version/consented_at';
  END IF;

  RAISE NOTICE 'OK: asserções da Fase 1 (T008-T011) passaram.';
END $$;
