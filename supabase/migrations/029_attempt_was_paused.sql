-- 029_attempt_was_paused.sql
--
-- Feature: 001-camada-aluno-simulados (Fase 1) — T023 (confete condicional).
-- Marca se a tentativa foi pausada em algum momento. O confete só aparece
-- quando o aluno concluiu de uma só vez (sem pausar) e dentro do tempo.
-- Aditivo.

ALTER TABLE simulado_attempts ADD COLUMN IF NOT EXISTS was_paused boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN simulado_attempts.was_paused IS
  'True se a tentativa foi pausada ao menos uma vez. Usado no gate do confete (concluiu de uma só vez).';
