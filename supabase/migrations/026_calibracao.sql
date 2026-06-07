-- 026_calibracao.sql
--
-- Feature: 001-camada-aluno-simulados (Fase 1) — T005
-- Calibração de dificuldade e qualidade do acervo a partir das respostas reais.
--
-- Decisões (roadmap D-05; requirements RN-06): dificuldade EMPÍRICA separada da
-- editorial (a tag editorial em tags/question_tags NÃO é sobrescrita); análise de
-- distratores; sinalização de candidatos a erro de gabarito.

CREATE TYPE gabarito_flag_status AS ENUM ('aberto', 'revisado');

CREATE TABLE IF NOT EXISTS question_stats (
  question_id          uuid PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  empirical_difficulty numeric(4,3),    -- p = acertos / respostas (0..1)
  response_count       integer NOT NULL DEFAULT 0,
  is_reliable          boolean NOT NULL DEFAULT false,  -- acima do volume mínimo
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS question_answer_distribution (
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  counts      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- contagem por alternativa A..E
  PRIMARY KEY (question_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS question_doubts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  text        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gabarito_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  reason      text NOT NULL,                       -- distrator dominante, reporte de aluno, etc.
  status      gabarito_flag_status NOT NULL DEFAULT 'aberto',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_doubts_question ON question_doubts (question_id);
CREATE INDEX IF NOT EXISTS idx_gabarito_flags_status   ON gabarito_flags (status);

COMMENT ON TABLE question_stats IS 'Dificuldade empírica (p) separada da dificuldade editorial; is_reliable acima do volume mínimo.';
COMMENT ON TABLE question_answer_distribution IS 'Distribuição agregada de respostas por alternativa, por campanha.';
COMMENT ON TABLE question_doubts IS 'Dúvidas dos alunos agregadas para a live.';
COMMENT ON TABLE gabarito_flags IS 'Candidatos a erro de gabarito / reportes de questão.';
