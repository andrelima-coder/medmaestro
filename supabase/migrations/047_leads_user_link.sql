-- 047 — Vínculo lead → conta de aluno (porta pública de simulados).
-- Antes desta migration o lead e a conta criada no cadastro não tinham nenhuma
-- ligação persistida (a reconciliação era só por e-mail, na entrega da prova,
-- para o pixel). O vínculo permite restringir a superfície do aluno originado
-- de lead à(s) campanha(s) de onde ele veio.

alter table leads
  add column if not exists user_id uuid references profiles(id) on delete set null;

alter table leads
  add column if not exists converted_at timestamptz;

create index if not exists idx_leads_user_id on leads (user_id) where user_id is not null;

comment on column leads.user_id is 'Conta de aluno criada a partir deste lead (token lt ou reconciliação por e-mail no cadastro).';
comment on column leads.converted_at is 'Quando o lead virou conta.';
