-- 007_import_compilado_columns.sql
-- Suporte à importação do compilado (Banco de questões TEMI):
-- colunas de origem/taxonomia do documento, método de extração 'import' e board AMI.
-- Aplicada inicialmente via MCP em 2026-06-01; arquivada aqui para o repositório
-- bater com o banco. Idempotente.

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS external_id   text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS import_source text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS doc_taxonomy  jsonb;

COMMENT ON COLUMN public.questions.external_id IS
  'ID estável da questão no documento compilado de origem (idempotência da importação).';
COMMENT ON COLUMN public.questions.import_source IS
  'Fonte do compilado: AMIB, AMI, etc.';
COMMENT ON COLUMN public.questions.doc_taxonomy IS
  'Taxonomia original do documento (carreira/area/especialidade/tema/topico). '
  'Sujeita a revisão; reconciliável com a taxonomia da IA.';

-- Permite extraction_method = 'import' (além de vision/text/ocr/recovery).
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_extraction_method_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_extraction_method_check
  CHECK (extraction_method = ANY (ARRAY['vision','text','ocr','recovery','import']));

-- Board AMI (Acervo Medicina Intensiva).
INSERT INTO public.exam_boards (slug, short_name, name)
SELECT 'ami', 'AMI', 'Acervo Medicina Intensiva'
WHERE NOT EXISTS (SELECT 1 FROM public.exam_boards WHERE slug = 'ami');
