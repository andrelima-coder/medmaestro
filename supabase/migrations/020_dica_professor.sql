-- 020_dica_professor.sql
-- Adiciona o valor 'dica_professor' ao enum comment_type, usado pela feature
-- "Exportação para professores" (dicas pedagógicas geradas por IA).
-- Já aplicado em produção via MCP em 2026-06-06; este arquivo registra a mudança
-- no repositório. Idempotente.
ALTER TYPE comment_type ADD VALUE IF NOT EXISTS 'dica_professor';
