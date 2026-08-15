-- Preferências do aluno (mentoria). Primeira preferência: meta semanal de foco
-- em minutos, editável pelo próprio aluno na página /aluno/foco.
create table if not exists mt_preferencias (
  user_id uuid primary key references profiles(id) on delete cascade,
  meta_foco_semanal_min integer not null default 1080
    check (meta_foco_semanal_min between 60 and 4320),
  updated_at timestamptz not null default now()
);

alter table mt_preferencias enable row level security;

create policy "mt_preferencias_select_own" on mt_preferencias
  for select to authenticated using (auth.uid() = user_id);

create policy "mt_preferencias_insert_own" on mt_preferencias
  for insert to authenticated with check (auth.uid() = user_id);

create policy "mt_preferencias_update_own" on mt_preferencias
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on mt_preferencias from anon;

create trigger mt_preferencias_updated_at
  before update on mt_preferencias
  for each row execute function update_updated_at();
