-- 045_lead_email_verification.sql
--
-- Verificação de e-mail do lead capturado pelo formulário embedável.
-- Ativa o gate `campaign_form.require_email_verification` (023), até aqui um
-- toggle sem efeito: o lead recebe um código de 6 dígitos por e-mail e só
-- avança para o simulado depois de confirmá-lo.
--
-- Fluxo: /api/public/leads emite o código; /api/public/leads/verify confirma
-- e carimba leads.email_verified_at.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS lead_email_verifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  code_hash    text NOT NULL,                       -- sha256 do código de 6 dígitos
  expires_at   timestamptz NOT NULL,
  attempts     smallint NOT NULL DEFAULT 0,         -- tentativas de confirmação
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_email_verifications_lead
  ON lead_email_verifications (lead_id, created_at DESC);

-- RLS sem policies: só o service-role (endpoints públicos server-side) acessa.
ALTER TABLE lead_email_verifications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE lead_email_verifications IS 'Códigos de verificação de e-mail do lead (6 dígitos, hash sha256, expiração curta).';
COMMENT ON COLUMN leads.email_verified_at IS 'Carimbo de quando o lead confirmou o e-mail via código.';
