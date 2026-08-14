-- 042_exam_boards_banca_link.sql
--
-- Continuação de 041_bancas_unification.sql. Achado: exam_boards carrega
-- config específica de extração que `bancas` não tem (supports_booklet_colors,
-- default_specialty_id) — não dá pra aposentar a tabela ainda. E `lotes/novo`
-- (cadastro de caderno novo) grava exams.board_id mas nunca exams.banca_id,
-- então todo caderno extraído a partir de agora fica invisível pro filtro de
-- banca das RPCs migradas em 041.
--
-- Fix: formaliza a ligação exam_boards -> bancas (1:1 hoje, mas modelado
-- como FK opcional para quando existir mais de uma exam_board por banca ou
-- vice-versa). Backfill do único par conhecido: AMIB -> TEMI.

ALTER TABLE exam_boards ADD COLUMN IF NOT EXISTS banca_id uuid REFERENCES bancas(id);

CREATE INDEX IF NOT EXISTS idx_exam_boards_banca ON exam_boards (banca_id);

DO $$
DECLARE
  v_banca_id uuid;
  v_updated  int;
BEGIN
  SELECT id INTO v_banca_id FROM bancas WHERE slug = 'temi';
  IF v_banca_id IS NULL THEN
    RAISE EXCEPTION 'banca "temi" não encontrada em bancas — abortando backfill de exam_boards.banca_id';
  END IF;

  UPDATE exam_boards
  SET banca_id = v_banca_id
  WHERE banca_id IS NULL AND slug = 'amib';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'exam_boards.banca_id preenchido em % linha(s)', v_updated;
END $$;

COMMENT ON COLUMN exam_boards.banca_id IS
  'Vínculo com bancas (fonte de verdade de agendamento/currículo). Setar ao cadastrar uma exam_board nova em configuracoes/hierarquia, pra que lotes/novo consiga resolver exams.banca_id automaticamente a partir do board_id escolhido no upload.';
