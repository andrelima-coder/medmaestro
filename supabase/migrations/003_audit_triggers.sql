-- =============================================================
-- Migration 003 — Auditoria completa
-- Aplicar no Supabase Studio (SQL Editor) ou via supabase db push
-- =============================================================

-- 1. Coluna created_by em exams (quem fez o upload)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 2. Função genérica de trigger de auditoria
--    Grava em audit_logs para INSERT / UPDATE / DELETE.
--    user_id = auth.uid() funciona para operações via client autenticado
--    (Studio, API anon/authenticated). Para service-role fica NULL — o código
--    instrumentado preenche explicitamente via logAudit().
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_id uuid;
  v_before    jsonb;
  v_after     jsonb;
BEGIN
  -- Determina ID da entidade
  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id;
  ELSE
    v_entity_id := NEW.id;
  END IF;

  -- Captura snapshots
  IF TG_OP = 'INSERT' THEN
    v_before := NULL;
    v_after  := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
  ELSE -- DELETE
    v_before := to_jsonb(OLD);
    v_after  := NULL;
  END IF;

  INSERT INTO audit_logs (user_id, entity_type, entity_id, action, before_data, after_data)
  VALUES (
    auth.uid(),          -- NULL quando service-role; preenchido pelo código para operações de app
    TG_TABLE_NAME,
    v_entity_id,
    TG_OP,
    v_before,
    v_after
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. Aplica trigger nas tabelas de catálogo
--    Estas tabelas raramente mudam via app; o trigger captura edições diretas no Studio.

DROP TRIGGER IF EXISTS audit_tags ON tags;
CREATE TRIGGER audit_tags
  AFTER INSERT OR UPDATE OR DELETE ON tags
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS audit_exam_boards ON exam_boards;
CREATE TRIGGER audit_exam_boards
  AFTER INSERT OR UPDATE OR DELETE ON exam_boards
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS audit_specialties ON specialties;
CREATE TRIGGER audit_specialties
  AFTER INSERT OR UPDATE OR DELETE ON specialties
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- 4. Trigger em exams (captura uploads feitos diretamente no banco)
--    Uploads via app já são instrumentados via logAudit() no código.
DROP TRIGGER IF EXISTS audit_exams ON exams;
CREATE TRIGGER audit_exams
  AFTER INSERT OR UPDATE OR DELETE ON exams
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- 5. RLS — admin e superadmin podem ler audit_logs
DROP POLICY IF EXISTS "admin_read_audit_logs" ON audit_logs;
CREATE POLICY "admin_read_audit_logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );
