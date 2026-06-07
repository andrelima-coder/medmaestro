-- 034_rls_initplan_optimization.sql
--
-- Feature: 001-camada-aluno-simulados — performance (advisor auth_rls_initplan).
-- Envolve auth.uid() em (select auth.uid()) para evitar reavaliação por linha.
-- Mesma semântica das políticas de 027/031; apenas otimização de plano.
-- Idempotente (DROP POLICY IF EXISTS + CREATE).

-- simulado_attempts
DROP POLICY IF EXISTS "aluno_rw_own_attempts" ON simulado_attempts;
CREATE POLICY "aluno_rw_own_attempts" ON simulado_attempts
  FOR ALL USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "staff_read_attempts" ON simulado_attempts;
CREATE POLICY "staff_read_attempts" ON simulado_attempts
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

-- question_attempts
DROP POLICY IF EXISTS "aluno_rw_own_question_attempts" ON question_attempts;
CREATE POLICY "aluno_rw_own_question_attempts" ON question_attempts
  FOR ALL USING (attempt_id IN (SELECT id FROM simulado_attempts WHERE user_id = (select auth.uid())))
  WITH CHECK (attempt_id IN (SELECT id FROM simulado_attempts WHERE user_id = (select auth.uid())));
DROP POLICY IF EXISTS "staff_read_question_attempts" ON question_attempts;
CREATE POLICY "staff_read_question_attempts" ON question_attempts
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

-- attempt_results
DROP POLICY IF EXISTS "aluno_read_own_result" ON attempt_results;
CREATE POLICY "aluno_read_own_result" ON attempt_results
  FOR SELECT USING (attempt_id IN (SELECT id FROM simulado_attempts WHERE user_id = (select auth.uid())));
DROP POLICY IF EXISTS "staff_read_results" ON attempt_results;
CREATE POLICY "staff_read_results" ON attempt_results
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

-- question_doubts
DROP POLICY IF EXISTS "aluno_insert_own_doubt" ON question_doubts;
CREATE POLICY "aluno_insert_own_doubt" ON question_doubts
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "aluno_read_own_doubt" ON question_doubts;
CREATE POLICY "aluno_read_own_doubt" ON question_doubts
  FOR SELECT USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "staff_read_doubts" ON question_doubts;
CREATE POLICY "staff_read_doubts" ON question_doubts
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

-- campaigns (aluno_read_published_campaigns não usa auth.uid())
DROP POLICY IF EXISTS "staff_manage_campaigns" ON campaigns;
CREATE POLICY "staff_manage_campaigns" ON campaigns
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

-- campaign_form
DROP POLICY IF EXISTS "staff_manage_campaign_form" ON campaign_form;
CREATE POLICY "staff_manage_campaign_form" ON campaign_form
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

-- leads
DROP POLICY IF EXISTS "staff_rw_leads" ON leads;
CREATE POLICY "staff_rw_leads" ON leads
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

-- lead_consents
DROP POLICY IF EXISTS "staff_rw_lead_consents" ON lead_consents;
CREATE POLICY "staff_rw_lead_consents" ON lead_consents
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

-- conversion_events
DROP POLICY IF EXISTS "staff_rw_conversion" ON conversion_events;
CREATE POLICY "staff_rw_conversion" ON conversion_events
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

-- question_stats
DROP POLICY IF EXISTS "staff_read_question_stats" ON question_stats;
CREATE POLICY "staff_read_question_stats" ON question_stats
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

-- question_answer_distribution
DROP POLICY IF EXISTS "staff_read_answer_distribution" ON question_answer_distribution;
CREATE POLICY "staff_read_answer_distribution" ON question_answer_distribution
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

-- gabarito_flags
DROP POLICY IF EXISTS "staff_rw_gabarito_flags" ON gabarito_flags;
CREATE POLICY "staff_rw_gabarito_flags" ON gabarito_flags
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

-- campaign_reminders
DROP POLICY IF EXISTS "staff_read_campaign_reminders" ON campaign_reminders;
CREATE POLICY "staff_read_campaign_reminders" ON campaign_reminders
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));
