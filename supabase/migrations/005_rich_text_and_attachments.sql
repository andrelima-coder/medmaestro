-- ============================================================
-- 005 — Rich text em questões + tabela de anexos manuais
-- ============================================================
--
-- Permite:
--   1. Editar enunciado e alternativas em rich text (HTML sanitizado)
--   2. Revisor anexar imagens/PDFs de correção quando o extrator falhou

-- ── Rich text fields ────────────────────────────────────────
-- Mantemos `stem` e `alternatives` (texto plano, fonte para text-first/exports)
-- e adicionamos versões HTML opcionais. Quando *_html for não-nulo,
-- é a fonte de verdade para renderização.

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS stem_html        text,
  ADD COLUMN IF NOT EXISTS alternatives_html jsonb;

COMMENT ON COLUMN questions.stem_html IS
  'Versão HTML rich-text do enunciado (sanitizada). NULL = usar stem.';
COMMENT ON COLUMN questions.alternatives_html IS
  'Versão HTML rich-text por letra (sanitizada). NULL = usar alternatives.';

-- ── Question attachments ────────────────────────────────────
CREATE TABLE IF NOT EXISTS question_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path  text NOT NULL,        -- bucket question-attachments
  file_name     text NOT NULL,
  mime_type     text NOT NULL,        -- image/png, image/jpeg, application/pdf
  size_bytes    bigint NOT NULL,
  caption       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mime_allowed CHECK (
    mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')
  )
);

CREATE INDEX IF NOT EXISTS idx_question_attachments_question
  ON question_attachments(question_id);

ALTER TABLE question_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_attachments"
  ON question_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_attachments"
  ON question_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "owner_or_admin_delete_attachments"
  ON question_attachments FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- ── Storage bucket ──────────────────────────────────────────
-- Privado; URLs assinadas via Service Role no backend.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('question-attachments', 'question-attachments', false)
ON CONFLICT (id) DO NOTHING;
