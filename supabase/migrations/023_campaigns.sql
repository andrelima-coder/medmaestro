-- 023_campaigns.sql
--
-- Feature: 001-camada-aluno-simulados (Fase 1) — T002
-- Cria a campanha "Simulado Aberto para Alunos" e o formulário embedável.
-- O molde de questões continua sendo `simulados` (014_simulado_sampling.sql);
-- a campanha apenas o envolve com acesso, agendamento, liberações e tracking.
--
-- Decisões (roadmap D-02, D-06, D-07): reuso do molde; embed com allowlist;
-- pixel/rastreamento POR CAMPANHA (cada simulado tem o seu).

CREATE TYPE campaign_access_mode AS ENUM ('imediato', 'data_unica', 'janela');
CREATE TYPE campaign_status      AS ENUM ('rascunho', 'publicada', 'despublicada');

CREATE TABLE IF NOT EXISTS campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulado_id       uuid NOT NULL REFERENCES simulados(id) ON DELETE RESTRICT,
  name              text NOT NULL,
  duration_minutes  integer NOT NULL CHECK (duration_minutes > 0),
  access_mode       campaign_access_mode NOT NULL DEFAULT 'imediato',
  window_start      timestamptz,
  window_end        timestamptz,
  pause_allowed     boolean NOT NULL DEFAULT true,
  releases          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- nota_gabarito, comentarios(modo/data), revisao
  live_at           timestamptz,
  live_url          text,
  tracking          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- pixel/IDs por provedor (Meta/Google)
  status            campaign_status NOT NULL DEFAULT 'rascunho',
  created_by        uuid REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Janela coerente quando o modo exige datas.
  CONSTRAINT campaigns_window_chk CHECK (
    access_mode <> 'janela' OR (window_start IS NOT NULL AND window_end IS NOT NULL AND window_end > window_start)
  )
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status_window ON campaigns (status, window_start, window_end);

CREATE TABLE IF NOT EXISTS campaign_form (
  campaign_id               uuid PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  fields                    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- campos pré-definidos + customizados
  embed_id                  text NOT NULL UNIQUE,                 -- identificador público do embed
  allowed_domains           text[] NOT NULL DEFAULT '{}',         -- allowlist de origens
  require_email_verification boolean NOT NULL DEFAULT false       -- opcional por campanha
);

CREATE INDEX IF NOT EXISTS idx_campaign_form_embed ON campaign_form (embed_id);

COMMENT ON TABLE campaigns IS 'Campanha de simulado aberto (Fase 1): acesso, agendamento, liberações e tracking por campanha.';
COMMENT ON TABLE campaign_form IS 'Formulário embedável da campanha (campos configuráveis, allowlist, embed_id).';
