-- Rastreia consumo da API Anthropic por chamada.
-- Permite calcular custo agregado e expor no Dashboard sem depender do console externo.
CREATE TABLE IF NOT EXISTS api_usage (
  id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider                    text NOT NULL DEFAULT 'anthropic',
  model                       text NOT NULL,
  operation                   text NOT NULL,
  exam_id                     uuid REFERENCES exams(id) ON DELETE SET NULL,
  question_id                 uuid REFERENCES questions(id) ON DELETE SET NULL,
  input_tokens                integer NOT NULL DEFAULT 0,
  output_tokens               integer NOT NULL DEFAULT 0,
  cache_creation_input_tokens integer NOT NULL DEFAULT 0,
  cache_read_input_tokens     integer NOT NULL DEFAULT 0,
  cost_usd                    numeric(12, 6) NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_usage_created_at_idx ON api_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_model_idx ON api_usage(model);
CREATE INDEX IF NOT EXISTS api_usage_operation_idx ON api_usage(operation);
CREATE INDEX IF NOT EXISTS api_usage_exam_id_idx ON api_usage(exam_id);

COMMENT ON TABLE api_usage IS 'Log de consumo por chamada à API Anthropic (Claude). Custo em USD calculado no momento da inserção.';
COMMENT ON COLUMN api_usage.operation IS 'Identificador da operação: classify, generate_variation, generate_flashcard, generate_comment, extract_vision, extract_recovery, etc.';
COMMENT ON COLUMN api_usage.cost_usd IS 'Custo já calculado em USD usando a tabela de preços vigente no momento da chamada.';
