-- 049 — Pergunta "já é aluno do produto?" no formulário de captação.
-- O enum lead_segment (ja_aluno | nao_aluno | aluno_outro_curso) e a coluna
-- leads.segment existem desde a 025, mas nenhum fluxo jamais gravava o valor.
-- ask_segment liga a pergunta no formulário embedável, por campanha (default
-- ligado — segmentar aluno × não-aluno é a razão de ser da captação).

alter table campaign_form
  add column if not exists ask_segment boolean not null default true;

comment on column campaign_form.ask_segment is 'Perguntar no embed se o lead já é aluno do produto (grava leads.segment).';
