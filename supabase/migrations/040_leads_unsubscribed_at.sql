-- 040_leads_unsubscribed_at.sql
--
-- Opt-out (descadastro) de e-mails de lembrete por lead. Aditivo/idempotente.
-- O endpoint público /api/public/unsubscribe marca esta coluna; o envio de
-- lembretes (sendCampaignReminder) ignora leads com unsubscribed_at definido.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;
