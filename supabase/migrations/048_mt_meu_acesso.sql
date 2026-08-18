-- 048 — Nível de acesso da conta do aluno (porta pública de simulados).
-- 'pleno'  = matrícula ativa (mentoria completa) OU conta antiga sem vínculo de lead
-- 'lead'   = conta criada a partir de um lead, sem matrícula: só enxerga a
--            superfície de Simulados e apenas as campanhas de onde veio.
-- Consumida pelo proxy (edge) e pelo layout do aluno via client com sessão.

create or replace function mt_meu_acesso()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from matriculas m
      where m.user_id = auth.uid() and m.status = 'ativa'
    ) then jsonb_build_object('kind', 'pleno')
    when exists (
      select 1 from leads l where l.user_id = auth.uid()
    ) then jsonb_build_object(
      'kind', 'lead',
      'campaign_ids', (
        select coalesce(jsonb_agg(distinct l.campaign_id), '[]'::jsonb)
        from leads l
        where l.user_id = auth.uid()
      )
    )
    else jsonb_build_object('kind', 'pleno')
  end;
$$;

revoke all on function mt_meu_acesso() from public;
grant execute on function mt_meu_acesso() to authenticated;
