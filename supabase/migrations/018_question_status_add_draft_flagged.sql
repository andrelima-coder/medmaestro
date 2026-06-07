-- 018_question_status_add_draft_flagged.sql
--
-- Contexto: a aplicação grava status 'flagged' (submitReviewAction('flag'),
-- filtro "Questões com alerta" em lotes/[id]) e 'draft' (saveAsDraft em
-- revisao/[id]), mas o enum question_status em produção NÃO possui esses
-- valores -> os UPDATEs falhavam silenciosamente / o filtro nunca casava.
--
-- Decisão (revisão Reversa 2026-06-06, confirmada por Andre): estender o enum
-- com os estados dedicados, em vez de remapear. Aditivo e reversível-na-prática
-- (ADD VALUE é seguro; valores ficam disponíveis para o código existente).
--
-- Nota: 'flagged' tem semântica próxima de 'needs_attention' (já existente).
-- Mantidos ambos por decisão de produto; revisar consolidação no futuro.

ALTER TYPE question_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE question_status ADD VALUE IF NOT EXISTS 'flagged';
