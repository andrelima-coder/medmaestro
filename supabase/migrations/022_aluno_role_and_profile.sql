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
-- ATENÇÃO: ADD VALUE de enum NÃO pode ser usado na mesma transação em que é
-- criado. Por isso o valor `aluno` é adicionado AQUI e só é referenciado por
-- políticas RLS na migração 027 (arquivo/transação separados).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'aluno';

-- Campos de lead/segmentação no perfil (PII tratada sob LGPD).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;            -- WhatsApp/celular
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS origin text;           -- campanha/UTM/domínio de origem
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_student_of text     -- segmento de marketing
  CHECK (is_student_of IN ('ja_aluno', 'nao_aluno', 'aluno_outro_curso'));

COMMENT ON COLUMN profiles.phone IS 'Telefone/WhatsApp do lead (PII, LGPD).';
COMMENT ON COLUMN profiles.origin IS 'Origem do lead: campanha/UTM/domínio.';
COMMENT ON COLUMN profiles.is_student_of IS 'Segmento: ja_aluno | nao_aluno | aluno_outro_curso.';
