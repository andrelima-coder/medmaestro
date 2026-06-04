-- 009_extracted_tables.sql
-- Tabelas estruturadas extraídas por Docling (integração de tabelas).
-- Cada item: { "html": "<table>...</table>", "page": <int> }.
-- Renderizadas no enunciado da questão (sanitizadas). Idempotente.

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS extracted_tables jsonb;

COMMENT ON COLUMN public.questions.extracted_tables IS
  'Tabelas estruturadas extraídas por Docling (array de {html, page}). Renderizadas no enunciado.';
