-- ============================================================
-- Migration 002 — Função RPC claim_jobs
-- Claim atômico de jobs com SKIP LOCKED (evita race conditions
-- quando múltiplos workers processam a fila simultaneamente)
-- ============================================================

CREATE OR REPLACE FUNCTION claim_jobs(p_limit int DEFAULT 5)
RETURNS SETOF jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE jobs
  SET
    status     = 'running',
    started_at = now(),
    attempts   = attempts + 1
  WHERE id IN (
    SELECT id
    FROM jobs
    WHERE status = 'pending'
      AND attempts < max_attempts
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Permissão para service role chamar via RPC
GRANT EXECUTE ON FUNCTION claim_jobs(int) TO service_role;
