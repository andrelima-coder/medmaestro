-- 044 — Flashcards SRS v2 (estilo Anki). 2026-08-15.
-- Evolui o SM-2 simplificado de mt_flashcard_registrar (boolean) para 4 graus
-- de resposta (1=Errei, 2=Difícil, 3=Bom, 4=Fácil), com:
--   • learning step: errar devolve o card em ~10 min (mesma sessão), não +1 dia
--   • fuzz de ±5% em intervalos ≥3 dias (evita pilhas no mesmo dia)
--   • limite diário de cards novos na fila (default 20/dia)
--   • desfazer a última resposta (restaura estado + remove log/XP)
-- As funções v1 (mt_flashcard_fila / mt_flashcard_registrar) permanecem
-- intactas — o mentortemi-web legado continua funcionando.

-- Grau da resposta no log (v1 continua gravando só `acertou`)
alter table mt_flashcard_review_log add column if not exists grau smallint;

-- ============================================================
-- Fila v2: aprendendo/revisão vencidos primeiro; novos por último,
-- respeitando o limite diário (novos já introduzidos hoje contam).
-- Retorna intervalo/ease para o front exibir a previsão nos botões.
-- ============================================================
create or replace function mt_flashcard_fila_v2(p_limite int default 30, p_novos_max int default 20)
returns table (
  flashcard_id uuid,
  front text,
  back text,
  card_type text,
  estado srs_estado,
  due_at timestamptz,
  novo boolean,
  intervalo_dias numeric,
  ease numeric
)
language sql
security definer
set search_path = public
as $$
  with novos_hoje as (
    select count(*) as n from mt_flashcard_cards c
    where c.user_id = auth.uid() and c.created_at::date = current_date
  ),
  vencidos as (
    select f.id as flashcard_id, f.front, f.back, f.card_type,
      c.estado, c.due_at, false as novo, c.intervalo_dias, c.ease
    from mt_flashcard_cards c
    join flashcards f on f.id = c.flashcard_id
    where c.user_id = auth.uid() and c.due_at <= now()
  ),
  novos as (
    select f.id as flashcard_id, f.front, f.back, f.card_type,
      'novo'::srs_estado as estado, now() as due_at, true as novo,
      0::numeric as intervalo_dias, 2.5::numeric as ease
    from flashcards f
    where f.approved = true
      and not exists (
        select 1 from mt_flashcard_cards c
        where c.user_id = auth.uid() and c.flashcard_id = f.id
      )
    order by f.created_at
    limit greatest(0, (select p_novos_max - n from novos_hoje))
  )
  select * from (
    select * from vencidos
    union all
    select * from novos
  ) fila
  order by novo asc, due_at asc
  limit greatest(p_limite, 0);
$$;

-- ============================================================
-- Registrar v2: 4 graus.
--   1 Errei   → ease −0,20 · volta em 10 min · zera repetições · conta lapso/leech
--   2 Difícil → ease −0,15 · intervalo ×1,2 (mín. atual+1)
--   3 Bom     → ease =     · intervalo ×ease (1º acerto 1d, 2º 3d)
--   4 Fácil   → ease +0,10 · intervalo ×ease×1,3 (1º acerto 4d)
-- XP: Difícil 1 ponto, Bom/Fácil 2, Errei 0 (erro não é punido nem pago).
-- Retorna snapshot do estado anterior para permitir o desfazer.
-- ============================================================
create or replace function mt_flashcard_registrar_v2(p_flashcard_id uuid, p_grau int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_card mt_flashcard_cards;
  v_era_novo boolean := false;
  v_novo_intervalo numeric;
  v_nova_ease numeric;
  v_novo_estado srs_estado;
  v_erros_seguidos int;
  v_novas_repeticoes int;
  v_pontos int;
  v_due timestamptz;
  v_snapshot json;
begin
  if v_user is null then
    raise exception 'não autenticado';
  end if;
  if p_grau not between 1 and 4 then
    raise exception 'grau inválido: %', p_grau;
  end if;

  select * into v_card from mt_flashcard_cards
  where user_id = v_user and flashcard_id = p_flashcard_id
  for update;

  if not found then
    v_era_novo := true;
    insert into mt_flashcard_cards (user_id, flashcard_id)
    values (v_user, p_flashcard_id)
    returning * into v_card;
  end if;

  v_snapshot := json_build_object(
    'era_novo', v_era_novo,
    'estado', v_card.estado,
    'intervalo_dias', v_card.intervalo_dias,
    'ease', v_card.ease,
    'due_at', v_card.due_at,
    'repeticoes', v_card.repeticoes,
    'lapsos', v_card.lapsos,
    'erros_seguidos', v_card.erros_seguidos,
    'ultima_revisao', v_card.ultima_revisao
  );

  if p_grau = 1 then
    v_erros_seguidos := v_card.erros_seguidos + 1;
    v_nova_ease := greatest(1.3, v_card.ease - 0.2);
    v_novo_intervalo := 0;
    v_novo_estado := case when v_erros_seguidos >= 4 then 'leech' else 'aprendendo' end;
    v_novas_repeticoes := 0;
    v_pontos := 0;
    v_due := now() + interval '10 minutes';
  else
    v_erros_seguidos := 0;
    v_novas_repeticoes := v_card.repeticoes + 1;
    if p_grau = 2 then
      v_nova_ease := greatest(1.3, v_card.ease - 0.15);
      v_novo_intervalo := case
        when v_card.repeticoes = 0 then 1
        when v_card.repeticoes = 1 then 2
        else greatest(v_card.intervalo_dias + 1, round(v_card.intervalo_dias * 1.2))
      end;
      v_pontos := 1;
    elsif p_grau = 3 then
      v_nova_ease := v_card.ease;
      v_novo_intervalo := case
        when v_card.repeticoes = 0 then 1
        when v_card.repeticoes = 1 then 3
        else round(v_card.intervalo_dias * v_nova_ease)
      end;
      v_pontos := 2;
    else
      v_nova_ease := least(2.8, v_card.ease + 0.1);
      v_novo_intervalo := case
        when v_card.repeticoes = 0 then 4
        when v_card.repeticoes = 1 then 5
        else round(v_card.intervalo_dias * v_nova_ease * 1.3)
      end;
      v_pontos := 2;
    end if;
    -- fuzz ±5% para espalhar revisões (só em intervalos maiores)
    if v_novo_intervalo >= 3 then
      v_novo_intervalo := greatest(3, round(v_novo_intervalo * (0.95 + random() * 0.1)));
    end if;
    v_novo_estado := case when v_novas_repeticoes <= 1 then 'aprendendo' else 'revisao' end;
    v_due := now() + (v_novo_intervalo || ' days')::interval;
  end if;

  update mt_flashcard_cards set
    estado = v_novo_estado,
    intervalo_dias = v_novo_intervalo,
    ease = v_nova_ease,
    due_at = v_due,
    repeticoes = v_novas_repeticoes,
    lapsos = lapsos + (case when p_grau = 1 then 1 else 0 end),
    erros_seguidos = v_erros_seguidos,
    ultima_revisao = now()
  where user_id = v_user and flashcard_id = p_flashcard_id;

  insert into mt_flashcard_review_log (user_id, flashcard_id, acertou, intervalo_depois, grau)
  values (v_user, p_flashcard_id, p_grau > 1, v_novo_intervalo, p_grau);

  if v_pontos > 0 then
    insert into mt_xp_eventos (user_id, tipo, pontos, referencia)
    values (v_user, 'flashcard_revisado', v_pontos, p_flashcard_id);
  end if;

  return json_build_object(
    'pontos_ganhos', v_pontos,
    'proxima_revisao', case when p_grau = 1 then null else v_due::date end,
    'volta_em_minutos', case when p_grau = 1 then 10 else null end,
    'intervalo_dias', v_novo_intervalo,
    'estado', v_novo_estado,
    'leech', v_novo_estado = 'leech',
    'snapshot', v_snapshot
  );
end;
$$;

-- ============================================================
-- Desfazer: restaura o estado anterior do card (snapshot devolvido pelo
-- registrar_v2), remove a última linha do log e o XP correspondente.
-- Escopo restrito ao próprio usuário (RLS + auth.uid()); valores clampados.
-- ============================================================
create or replace function mt_flashcard_desfazer(p_flashcard_id uuid, p_snapshot jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_log mt_flashcard_review_log;
  v_pontos int;
begin
  if v_user is null then
    raise exception 'não autenticado';
  end if;

  -- última resposta registrada deste card (é ela que será desfeita)
  select * into v_log from mt_flashcard_review_log
  where user_id = v_user and flashcard_id = p_flashcard_id
  order by created_at desc limit 1;

  if not found or v_log.created_at < now() - interval '30 minutes' then
    raise exception 'nada recente para desfazer';
  end if;

  if (p_snapshot->>'era_novo')::boolean then
    delete from mt_flashcard_cards
    where user_id = v_user and flashcard_id = p_flashcard_id;
  else
    update mt_flashcard_cards set
      estado = coalesce((p_snapshot->>'estado')::srs_estado, estado),
      intervalo_dias = greatest(0, coalesce((p_snapshot->>'intervalo_dias')::numeric, intervalo_dias)),
      ease = least(2.8, greatest(1.3, coalesce((p_snapshot->>'ease')::numeric, ease))),
      due_at = coalesce((p_snapshot->>'due_at')::timestamptz, due_at),
      repeticoes = greatest(0, coalesce((p_snapshot->>'repeticoes')::int, repeticoes)),
      lapsos = greatest(0, coalesce((p_snapshot->>'lapsos')::int, lapsos)),
      erros_seguidos = greatest(0, coalesce((p_snapshot->>'erros_seguidos')::int, erros_seguidos)),
      ultima_revisao = (p_snapshot->>'ultima_revisao')::timestamptz
    where user_id = v_user and flashcard_id = p_flashcard_id;
  end if;

  delete from mt_flashcard_review_log where id = v_log.id;

  -- remove o XP pago pela resposta desfeita (se houve)
  v_pontos := case coalesce(v_log.grau, case when v_log.acertou then 3 else 1 end)
    when 1 then 0 when 2 then 1 else 2 end;
  if v_pontos > 0 then
    delete from mt_xp_eventos where id = (
      select id from mt_xp_eventos
      where user_id = v_user and tipo = 'flashcard_revisado'
        and referencia = p_flashcard_id
        and created_at >= now() - interval '30 minutes'
      order by created_at desc limit 1
    );
  end if;

  return json_build_object('ok', true);
end;
$$;

-- Postura de segurança Tier 1 (migration 042): sem acesso anônimo às RPCs de aluno.
revoke execute on function public.mt_flashcard_fila_v2(int, int)          from anon, public;
revoke execute on function public.mt_flashcard_registrar_v2(uuid, int)   from anon, public;
revoke execute on function public.mt_flashcard_desfazer(uuid, jsonb)     from anon, public;
grant  execute on function public.mt_flashcard_fila_v2(int, int)          to authenticated;
grant  execute on function public.mt_flashcard_registrar_v2(uuid, int)   to authenticated;
grant  execute on function public.mt_flashcard_desfazer(uuid, jsonb)     to authenticated;
