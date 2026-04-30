-- Identifica qual plugin de extração usar para cada prova.
-- Diferente de board_id (organização), extractor_id especifica o parser
-- (regex de questão, prompt Vision, parser de gabarito).
ALTER TABLE exams ADD COLUMN IF NOT EXISTS extractor_id text;

COMMENT ON COLUMN exams.extractor_id IS
  'Slug do plugin de extração (ex.: amib_temi, generico). NULL = auto-detectar no próximo run.';

-- Backfill: provas associadas à banca AMIB usam o extrator amib_temi.
UPDATE exams e
SET extractor_id = 'amib_temi'
FROM exam_boards b
WHERE e.board_id = b.id
  AND b.slug = 'amib'
  AND e.extractor_id IS NULL;

CREATE INDEX IF NOT EXISTS exams_extractor_id_idx ON exams(extractor_id);
