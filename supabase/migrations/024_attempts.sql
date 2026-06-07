-- 024_attempts.sql
--
-- Feature: 001-camada-aluno-simulados (Fase 1) — T003
-- O conceito central que faltava: a TENTATIVA. Sem ela não há resultado,
-- analytics nem calibração.
--
-- Decisões (roadmap D-03; requirements RN-02, RN-07): estado de execução e
-- cronômetro autoritativos no servidor; tentativa única por usuário/campanha.

CREATE TYPE attempt_status AS ENUM ('em_andamento', 'entregue', 'expirado');

CREATE TABLE IF NOT EXISTS simulado_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  started_at      timestamptz NOT NULL DEFAULT now(),
  time_remaining  integer NOT NULL,            -- segundos; autoridade do servidor
  status          attempt_status NOT NULL DEFAULT 'em_andamento',
  -- RN-02: tentativa única por usuário por campanha.
  CONSTRAINT simulado_attempts_unique UNIQUE (user_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS question_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id    uuid NOT NULL REFERENCES simulado_attempts(id) ON DELETE CASCADE,
  question_id   uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  selected_alt  char(1) CHECK (selected_alt IN ('A','B','C','D','E')),  -- NULL = pulada
  is_saved      boolean NOT NULL DEFAULT false,   -- resposta travada
  time_spent    integer NOT NULL DEFAULT 0,       -- segundos na questão
  CONSTRAINT question_attempts_unique UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_question_attempts_question ON question_attempts (question_id);
CREATE INDEX IF NOT EXISTS idx_question_attempts_attempt  ON question_attempts (attempt_id);

CREATE TABLE IF NOT EXISTS attempt_results (
  attempt_id           uuid PRIMARY KEY REFERENCES simulado_attempts(id) ON DELETE CASCADE,
  score                numeric(5,2),
  completed_single_run boolean NOT NULL DEFAULT false,  -- sem pausa e dentro do tempo (confete)
  finished_at          timestamptz
);

COMMENT ON TABLE simulado_attempts IS 'Execução de uma campanha por um aluno; cronômetro autoritativo (time_remaining).';
COMMENT ON TABLE question_attempts IS 'Resposta do aluno por questão; is_saved trava a alternativa.';
COMMENT ON TABLE attempt_results IS 'Resultado calculado; completed_single_run habilita o confete.';
