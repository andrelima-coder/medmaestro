-- 037_practice_and_goals.sql
--
-- Feature: 003-estudo-recorrente (Fase 3) — B001
-- Prática avulsa, meta diária e cards de erro dominados. RLS privado do aluno.
-- Aditivo.

CREATE TABLE IF NOT EXISTS practice_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id  uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_alt char(1) CHECK (selected_alt IN ('A','B','C','D','E')),
  is_correct   boolean NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_practice_user ON practice_attempts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_practice_question ON practice_attempts(question_id);

ALTER TABLE practice_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aluno_rw_own_practice" ON practice_attempts
  FOR ALL USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "staff_read_practice" ON practice_attempts
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role <> 'aluno'));

CREATE TABLE IF NOT EXISTS student_goals (
  user_id    uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  daily_goal integer NOT NULL DEFAULT 10 CHECK (daily_goal > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE student_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aluno_rw_own_goals" ON student_goals
  FOR ALL USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

CREATE TABLE IF NOT EXISTS student_dismissed_cards (
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_dismissed_question ON student_dismissed_cards(question_id);
ALTER TABLE student_dismissed_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aluno_rw_own_dismissed" ON student_dismissed_cards
  FOR ALL USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

COMMENT ON TABLE practice_attempts IS 'Respostas de prática avulsa do aluno (feature 003).';
COMMENT ON TABLE student_goals IS 'Meta diária de questões do aluno.';
COMMENT ON TABLE student_dismissed_cards IS 'Cards de erro marcados como dominados pelo aluno.';
