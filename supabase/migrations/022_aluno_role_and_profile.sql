-- 022_aluno_role_and_profile.sql
--
-- Feature: 001-camada-aluno-simulados (Fase 1) — T001
-- Contexto: a camada do aluno introduz uma persona pública (candidato),
-- distinta dos papéis internos de staff. Aditivo sobre o enum user_role
-- (001_initial_schema.sql) e sobre profiles.
--
-- Decisão (forward, requirements RN-01/RN-02): novo papel `aluno`; unicidade
-- do aluno é POR E-MAIL (já único no auth). Campos de marketing em profiles.
--
-- DRIFT CONFIRMADO (via Supabase MCP, 2026-06-08): em produção `profiles.role`
-- é **text** (não o enum `user_role` da migração 001). Portanto `'aluno'` já é
-- um valor válido e NÃO há ALTER TYPE aqui. Caso reconstrua de um banco onde
-- `role` ainda seja o enum `user_role`, adicione antes:
--   ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'aluno';
-- As políticas RLS (027) comparam `role <> 'aluno'` como texto — funciona em ambos.

-- Campos de lead/segmentação no perfil (PII tratada sob LGPD).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;            -- WhatsApp/celular
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS origin text;           -- campanha/UTM/domínio de origem
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_student_of text     -- segmento de marketing
  CHECK (is_student_of IN ('ja_aluno', 'nao_aluno', 'aluno_outro_curso'));

COMMENT ON COLUMN profiles.phone IS 'Telefone/WhatsApp do lead (PII, LGPD).';
COMMENT ON COLUMN profiles.origin IS 'Origem do lead: campanha/UTM/domínio.';
COMMENT ON COLUMN profiles.is_student_of IS 'Segmento: ja_aluno | nao_aluno | aluno_outro_curso.';
