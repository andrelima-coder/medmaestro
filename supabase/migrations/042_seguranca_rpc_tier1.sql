-- 042 — Segurança RPC/Views (Tier 1). Auditoria 2026-08-14.
-- Fecha o IDOR NÃO-AUTENTICADO: funções SECURITY DEFINER que recebem p_user
-- eram chamáveis por `anon` (chave publishable), permitindo passar o UUID de
-- outro usuário e ler/gravar dados dele contornando o RLS.
-- Seguro e reversível: alunos logados usam o papel `authenticated` e continuam
-- funcionando; só o acesso anônimo (sem login) é cortado.
--
-- Tier 2 (reescrever corpo para auth.uid(), fechando também o IDOR autenticado)
-- fica para uma branch com teste do app do aluno — ver auditoria.

-- 1) Views que rodavam como criador (ignoravam RLS). Não são lidas direto pelo
--    frontend (só dentro das funções SQL), então security_invoker é seguro.
alter view public.v_modulo_peso    set (security_invoker = on);
alter view public.v_mt_dias_ativos set (security_invoker = on);

-- 2) Remover EXECUTE do papel anônimo nas funções que operam sobre dados de UM
--    usuário (todas features de aluno logado — anon não tem por que chamá-las).
revoke execute on function public.calcular_eficiencia(uuid, date, date)                                                  from anon;
revoke execute on function public.mt_arvore(uuid)                                                                        from anon;
revoke execute on function public.mt_avaliar_selos(uuid)                                                                 from anon;
revoke execute on function public.mt_desempenho_modulo(uuid)                                                             from anon;
revoke execute on function public.mt_desempenho_tema(uuid)                                                               from anon;
revoke execute on function public.mt_percentil(uuid)                                                                     from anon;
revoke execute on function public.mt_semana(uuid, date)                                                                  from anon;
revoke execute on function public.mt_debrief(uuid)                                                                       from anon;
revoke execute on function public.mt_pontuar_revisao(uuid, uuid, boolean, smallint, boolean, numeric, numeric, boolean)  from anon;
revoke execute on function public.srs_registrar(uuid, uuid, boolean, smallint, integer, causa_erro)                     from anon;
revoke execute on function public.mt_confirmar_envio(uuid, boolean, text)                                               from anon;
revoke execute on function public.mt_trocar_banca(uuid)                                                                  from anon;

-- ROLLBACK (se necessário):
--   alter view public.v_modulo_peso    set (security_invoker = off);
--   alter view public.v_mt_dias_ativos set (security_invoker = off);
--   grant execute on function public.mt_arvore(uuid) to anon;  -- etc. p/ cada uma
