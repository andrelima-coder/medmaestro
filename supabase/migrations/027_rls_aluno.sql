-- 027_rls_aluno.sql
--
-- Feature: 001-camada-aluno-simulados (Fase 1) — T006
-- Políticas RLS para a camada do aluno. O valor de enum `aluno` foi criado na
-- migração 022 (transação separada), então pode ser referenciado aqui.
--
-- Princípio herdado (ADR-0010): RLS desde o schema. Aluno só enxerga os próprios
-- dados; staff (qualquer papel <> 'aluno') acessa os dados operacionais.
-- O service-role do servidor ignora RLS (jobs/escritas server-side).

-- Helpers de legibilidade via subselect (mesmo padrão de 003/005).
-- staff = qualquer perfil cujo papel não seja 'aluno'.

ALTER TABLE simulado_attempts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_attempts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_results            ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_doubts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_consents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_form              ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_stats             ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_answer_distribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE gabarito_flags             ENABLE ROW LEVEL SECURITY;

-- ── Aluno: próprias tentativas ───────────────────────────────────────────────
CREATE POLICY "aluno_rw_own_attempts" ON simulado_attempts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff_read_attempts" ON simulado_attempts
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'));

-- ── Aluno: respostas das próprias tentativas ─────────────────────────────────
CREATE POLICY "aluno_rw_own_question_attempts" ON question_attempts
  FOR ALL USING (
    attempt_id IN (SELECT id FROM simulado_attempts WHERE user_id = auth.uid())
  ) WITH CHECK (
    attempt_id IN (SELECT id FROM simulado_attempts WHERE user_id = auth.uid())
  );
CREATE POLICY "staff_read_question_attempts" ON question_attempts
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'));

-- ── Aluno: próprio resultado (leitura) ───────────────────────────────────────
CREATE POLICY "aluno_read_own_result" ON attempt_results
  FOR SELECT USING (
    attempt_id IN (SELECT id FROM simulado_attempts WHERE user_id = auth.uid())
  );
CREATE POLICY "staff_read_results" ON attempt_results
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'));

-- ── Aluno: próprias dúvidas (insert/select) ──────────────────────────────────
CREATE POLICY "aluno_insert_own_doubt" ON question_doubts
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "aluno_read_own_doubt" ON question_doubts
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "staff_read_doubts" ON question_doubts
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'));

-- ── Aluno: ler campanhas publicadas (gating fino é server-side) ──────────────
CREATE POLICY "aluno_read_published_campaigns" ON campaigns
  FOR SELECT USING (status = 'publicada');
CREATE POLICY "staff_manage_campaigns" ON campaigns
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'));
CREATE POLICY "staff_manage_campaign_form" ON campaign_form
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'));

-- ── Staff (marketing/curadoria): leads, consentimentos, conversão, calibração ─
CREATE POLICY "staff_rw_leads" ON leads
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'));
CREATE POLICY "staff_rw_lead_consents" ON lead_consents
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'));
CREATE POLICY "staff_rw_conversion" ON conversion_events
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'));
CREATE POLICY "staff_read_question_stats" ON question_stats
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'));
CREATE POLICY "staff_read_answer_distribution" ON question_answer_distribution
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'));
CREATE POLICY "staff_rw_gabarito_flags" ON gabarito_flags
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'aluno'));

-- NOTA: leads/consentimentos são gravados pelo endpoint público via service-role
-- (ignora RLS). A distribuição por alternativa é exposta ao aluno apenas de forma
-- agregada e gated pelo servidor, não por leitura direta desta tabela.
