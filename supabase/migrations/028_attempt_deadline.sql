-- 028_attempt_deadline.sql
--
-- Feature: 001-camada-aluno-simulados (Fase 1) — T017 (runtime).
-- Cronômetro autoritativo no servidor com suporte a pausa:
--   - deadline_at = instante (wall-clock) em que o tempo acaba enquanto em execução.
--   - Pausado  <=> status 'em_andamento' E deadline_at IS NULL (time_remaining guarda o saldo).
--   - Em curso <=> deadline_at IS NOT NULL; remaining = deadline_at - now().
--
-- Aditivo; não altera dados existentes.

ALTER TABLE simulado_attempts ADD COLUMN IF NOT EXISTS deadline_at timestamptz;

COMMENT ON COLUMN simulado_attempts.deadline_at IS
  'Quando em execução, instante de término (server clock). NULL = pausado; saldo em time_remaining.';
