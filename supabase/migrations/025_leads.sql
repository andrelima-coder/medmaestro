-- 025_leads.sql
--
-- Feature: 001-camada-aluno-simulados (Fase 1) — T004
-- Lead capturado, consentimento LGPD versionado/carimbado e eventos de conversão.
--
-- Decisões (requirements RN-05; roadmap D-07): consentimento como prova legal;
-- dedup de lead por e-mail/campanha; eventos enviados ao pixel POR CAMPANHA.

CREATE TYPE lead_segment        AS ENUM ('ja_aluno', 'nao_aluno', 'aluno_outro_curso');
CREATE TYPE conversion_provider AS ENUM ('meta', 'google');
CREATE TYPE conversion_status   AS ENUM ('enviado', 'falha');

CREATE TABLE IF NOT EXISTS leads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email        text NOT NULL,                 -- chave de unicidade do lead (RN-02)
  fields       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- campos capturados (nome, whatsapp, customizados)
  segment      lead_segment,
  origin       text,                          -- domínio/UTM
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- dedup: um lead por e-mail por campanha.
  CONSTRAINT leads_unique_email_campaign UNIQUE (campaign_id, email)
);

CREATE TABLE IF NOT EXISTS lead_consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  consent_version text NOT NULL,              -- versão do texto aceito
  consented_at    timestamptz NOT NULL DEFAULT now(),  -- carimbo
  origin_url      text                        -- onde o consentimento foi dado
);

CREATE INDEX IF NOT EXISTS idx_lead_consents_lead ON lead_consents (lead_id);

CREATE TABLE IF NOT EXISTS conversion_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  provider    conversion_provider NOT NULL,
  event_type  text NOT NULL,                  -- lead_cadastrado, simulado_iniciado, etc.
  event_id    text NOT NULL,                  -- idempotência no provedor
  sent_at     timestamptz,
  status      conversion_status NOT NULL DEFAULT 'falha',
  CONSTRAINT conversion_events_idem UNIQUE (lead_id, provider, event_type)
);

CREATE INDEX IF NOT EXISTS idx_leads_campaign_segment ON leads (campaign_id, segment);
CREATE INDEX IF NOT EXISTS idx_conversion_events_status ON conversion_events (status);

COMMENT ON TABLE leads IS 'Lead capturado pelo formulário embedável; dedup por (campanha, e-mail).';
COMMENT ON TABLE lead_consents IS 'Consentimento LGPD versionado e carimbado (prova legal).';
COMMENT ON TABLE conversion_events IS 'Eventos enviados ao pixel por campanha (Meta/Google), com idempotência.';
