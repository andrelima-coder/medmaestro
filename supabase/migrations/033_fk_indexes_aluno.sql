-- 033_fk_indexes_aluno.sql
--
-- Feature: 001-camada-aluno-simulados — performance (advisor Supabase).
-- Índices de cobertura para foreign keys sem índice (lint unindexed_foreign_keys).
-- Aditivo/idempotente.

CREATE INDEX IF NOT EXISTS idx_campaigns_created_by ON campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_campaigns_simulado   ON campaigns(simulado_id);
CREATE INDEX IF NOT EXISTS idx_attempts_campaign    ON simulado_attempts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_doubts_campaign      ON question_doubts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_doubts_user          ON question_doubts(user_id);
CREATE INDEX IF NOT EXISTS idx_qad_campaign         ON question_answer_distribution(campaign_id);
CREATE INDEX IF NOT EXISTS idx_gabarito_flags_question ON gabarito_flags(question_id);
