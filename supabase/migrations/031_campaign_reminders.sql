-- 031_campaign_reminders.sql
--
-- Feature: 001-camada-aluno-simulados (Fase 1) — T028 (lembretes por e-mail).
-- Dedup em nível de campanha: cada tipo de lembrete é enviado uma vez por campanha.
-- Aditivo.

CREATE TABLE IF NOT EXISTS campaign_reminders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('abertura', 'live')),
  sent_at      timestamptz NOT NULL DEFAULT now(),
  recipients   int NOT NULL DEFAULT 0,
  CONSTRAINT campaign_reminders_unique UNIQUE (campaign_id, type)
);

ALTER TABLE campaign_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_campaign_reminders" ON campaign_reminders
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'));

COMMENT ON TABLE campaign_reminders IS 'Controle de envio de lembretes (abertura/live) por campanha, idempotente.';
