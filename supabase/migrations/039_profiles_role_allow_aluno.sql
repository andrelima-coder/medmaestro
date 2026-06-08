-- 039_profiles_role_allow_aluno.sql
--
-- Correção: profiles.role é text com CHECK `profiles_role_check` que listava
-- apenas superadmin/admin/professor/analista. Sem 'aluno', o cadastro da camada
-- do aluno (role='aluno') viola a constraint. Gap descoberto ao criar o 1º aluno.
-- Aditivo/reversível.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['superadmin','admin','professor','analista','aluno']));
