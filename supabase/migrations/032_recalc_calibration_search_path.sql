-- 032_recalc_calibration_search_path.sql
--
-- Feature: 001-camada-aluno-simulados — endurecimento (advisor Supabase).
-- Fixa o search_path da função para evitar o lint "function_search_path_mutable".
-- Aditivo/idempotente.

ALTER FUNCTION public.recalc_calibration(int) SET search_path = public;
