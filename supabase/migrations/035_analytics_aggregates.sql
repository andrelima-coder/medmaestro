-- 035_analytics_aggregates.sql
--
-- Feature: 002-analytics-desempenho (Fase 2) — A001
-- Tabelas agregadas (materializadas por recalc_analytics) para o dashboard do
-- aluno e o painel agregado do admin. RLS: aluno vê só o próprio; staff vê tudo.
-- Aditivo.

CREATE TABLE IF NOT EXISTS student_module_stats (
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dimension  text NOT NULL,                       -- 'modulo' | 'topico_edital'
  tag_id     uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  tag_label  text,
  correct    integer NOT NULL DEFAULT 0,
  total      integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dimension, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_sms_tag ON student_module_stats(tag_id);

ALTER TABLE student_module_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aluno_read_own_module_stats" ON student_module_stats
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "staff_read_module_stats" ON student_module_stats
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

CREATE TABLE IF NOT EXISTS campaign_module_stats (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  dimension   text NOT NULL,
  tag_id      uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  tag_label   text,
  correct     integer NOT NULL DEFAULT 0,
  total       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, dimension, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_cms_tag ON campaign_module_stats(tag_id);

ALTER TABLE campaign_module_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read_campaign_module_stats" ON campaign_module_stats
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

COMMENT ON TABLE student_module_stats IS 'Acerto do aluno por dimensão/tag (materializado por recalc_analytics).';
COMMENT ON TABLE campaign_module_stats IS 'Acerto agregado por campanha e tag (materializado por recalc_analytics).';
