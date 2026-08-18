-- 046: Preferências de Pomodoro do aluno (aba Configurações da mentoria).
-- Aditiva: colunas novas em mt_preferencias com defaults iguais aos valores
-- que hoje estão hardcoded no Foco (25/5/15).

alter table public.mt_preferencias
  add column if not exists foco_min integer not null default 25,
  add column if not exists pausa_curta_min integer not null default 5,
  add column if not exists pausa_longa_min integer not null default 15;

alter table public.mt_preferencias
  drop constraint if exists mt_preferencias_foco_min_check,
  drop constraint if exists mt_preferencias_pausa_curta_min_check,
  drop constraint if exists mt_preferencias_pausa_longa_min_check;

alter table public.mt_preferencias
  add constraint mt_preferencias_foco_min_check check (foco_min between 5 and 180),
  add constraint mt_preferencias_pausa_curta_min_check check (pausa_curta_min between 1 and 60),
  add constraint mt_preferencias_pausa_longa_min_check check (pausa_longa_min between 5 and 120);
