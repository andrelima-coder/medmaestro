-- ============================================================
-- MedMaestro — Schema inicial v1.2
-- Executar no Supabase via MCP ou SQL Editor
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- CAMADA 1 — Catálogo de exames
-- ============================================================

CREATE TABLE exam_boards (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,           -- ex: AMIB, SBPT
  slug        text UNIQUE NOT NULL,    -- ex: amib, sbpt
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE specialties (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_board_id uuid REFERENCES exam_boards(id) ON DELETE CASCADE,
  name          text NOT NULL,         -- ex: Medicina Intensiva
  slug          text NOT NULL,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(exam_board_id, slug)
);

CREATE TABLE exams (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  specialty_id  uuid REFERENCES specialties(id) ON DELETE RESTRICT,
  year          int NOT NULL CHECK (year BETWEEN 2000 AND 2050),
  color         text,                  -- cor da prova: azul, vermelho, verde, amarelo
  pdf_path      text,                  -- exam-pdfs bucket
  gabarito_path text,                  -- exam-pdfs bucket
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','extracting','classifying','done','error')),
  created_at    timestamptz DEFAULT now(),
  UNIQUE(specialty_id, year, color)
);

CREATE TABLE answer_keys (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id     uuid REFERENCES exams(id) ON DELETE CASCADE,
  question_no int NOT NULL,
  answer      char(1) NOT NULL CHECK (answer IN ('A','B','C','D','E','X')), -- X = anulada
  is_altered  boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(exam_id, question_no)
);

-- ============================================================
-- CAMADA 2 — Questões e imagens
-- ============================================================

CREATE TYPE question_status AS ENUM (
  'extracted',    -- saiu da IA, ainda não revisado
  'reviewing',    -- analista abriu para revisão
  'approved',     -- aprovado pelo analista
  'flagged',      -- sinalizado para atenção
  'rejected',     -- descartado
  'commented',    -- professor adicionou comentário didático
  'published',    -- publicado (disponível para simulados)
  'draft'         -- variante gerada por IA, aguarda revisão
);

CREATE TABLE questions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id         uuid REFERENCES exams(id) ON DELETE RESTRICT,
  question_no     int NOT NULL,
  correct_answer  char(1) CHECK (correct_answer IN ('A','B','C','D','E','X')),
  stem            text,                        -- enunciado
  alternative_a   text,
  alternative_b   text,
  alternative_c   text,
  alternative_d   text,
  alternative_e   text,
  has_image       boolean DEFAULT false,
  confidence_score numeric(4,3),              -- 0.000–1.000 da extração
  extraction_model text,                      -- modelo usado na extração
  status          question_status DEFAULT 'extracted',
  stem_tsv        tsvector GENERATED ALWAYS AS (
                    to_tsvector('portuguese', unaccent(coalesce(stem,'')))
                  ) STORED,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(exam_id, question_no)
);

CREATE INDEX idx_questions_status     ON questions(status);
CREATE INDEX idx_questions_exam       ON questions(exam_id);
CREATE INDEX idx_questions_stem_tsv   ON questions USING GIN(stem_tsv);
CREATE INDEX idx_questions_confidence ON questions(confidence_score ASC NULLS LAST);

CREATE TYPE image_scope_enum AS ENUM (
  'statement',
  'alternative_a',
  'alternative_b',
  'alternative_c',
  'alternative_d',
  'alternative_e',
  'explanation',
  'other'
);

CREATE TYPE image_type_enum AS ENUM (
  'clinical_photo',
  'ecg',
  'xray',
  'ct_scan',
  'mri',
  'ultrasound',
  'histology',
  'graph',
  'table',
  'formula',
  'diagram',
  'map',
  'other'
);

CREATE TABLE question_images (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id     uuid REFERENCES questions(id) ON DELETE CASCADE,
  image_scope     image_scope_enum NOT NULL,
  image_type      image_type_enum DEFAULT 'other',
  full_page_path  text NOT NULL,     -- question-images bucket: caminho da página inteira
  cropped_path    text,              -- question-images bucket: crop da região (opcional)
  use_cropped     boolean DEFAULT false,
  bounding_box    jsonb,             -- {"x":0.1,"y":0.3,"w":0.4,"h":0.2} — valores 0–1
  alt_text        text,              -- descrição gerada pelo Vision para acessibilidade
  page_number     int,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_question_images_question ON question_images(question_id);

CREATE TABLE comment_images (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id   uuid,                  -- FK adicionada após criação de question_comments
  path         text NOT NULL,         -- comment-images bucket
  alt_text     text,
  created_at   timestamptz DEFAULT now()
);

-- ============================================================
-- CAMADA 3 — Taxonomia dinâmica
-- ============================================================

CREATE TYPE taxonomy_scope AS ENUM ('internal', 'edital');

CREATE TYPE tag_dimension AS ENUM (
  'module',
  'topic',
  'subfield',
  'system',
  'difficulty',
  'cognitive_level'
);

CREATE TABLE taxonomies (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,
  scope       taxonomy_scope NOT NULL DEFAULT 'internal',
  dimension   tag_dimension NOT NULL,
  parent_id   uuid REFERENCES taxonomies(id) ON DELETE SET NULL,  -- hierarquia 3 níveis
  sort_order  int DEFAULT 0,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_taxonomies_dimension ON taxonomies(dimension);
CREATE INDEX idx_taxonomies_parent    ON taxonomies(parent_id);

CREATE TABLE tags (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  taxonomy_id  uuid REFERENCES taxonomies(id) ON DELETE CASCADE,
  label        text NOT NULL,
  color        text,                 -- hex, ex: #8B5CF6
  prompt_hint  text,                 -- instrução ao Claude para classificar nesta tag
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX idx_tags_taxonomy ON tags(taxonomy_id);

CREATE TABLE question_tags (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE,
  tag_id      uuid REFERENCES tags(id) ON DELETE CASCADE,
  origin      text NOT NULL DEFAULT 'ai' CHECK (origin IN ('ai','human')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(question_id, tag_id)
);

CREATE INDEX idx_question_tags_question ON question_tags(question_id);
CREATE INDEX idx_question_tags_tag      ON question_tags(tag_id);

-- ============================================================
-- CAMADA 4 — Editorial e auditoria
-- ============================================================

CREATE TABLE question_revisions (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id  uuid REFERENCES questions(id) ON DELETE CASCADE,
  revised_by   uuid REFERENCES auth.users(id),
  snapshot     jsonb NOT NULL,        -- estado completo da questão antes da edição
  action       text NOT NULL,         -- approve | correct | reject | flag | comment
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX idx_revisions_question ON question_revisions(question_id, created_at DESC);

CREATE TABLE review_assignments (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id  uuid REFERENCES questions(id) ON DELETE CASCADE UNIQUE,
  reviewer_id  uuid REFERENCES auth.users(id),
  assigned_at  timestamptz DEFAULT now(),
  expires_at   timestamptz DEFAULT now() + interval '10 minutes',
  CONSTRAINT not_expired CHECK (expires_at > assigned_at)
);

CREATE INDEX idx_review_assignments_reviewer ON review_assignments(reviewer_id);

CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    uuid REFERENCES auth.users(id),
  entity_type text NOT NULL,          -- question | exam | tag | user | simulado
  entity_id   uuid NOT NULL,
  action      text NOT NULL,
  metadata    jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_id, entity_type, created_at DESC);
CREATE INDEX idx_audit_actor  ON audit_logs(actor_id, created_at DESC);

CREATE TYPE comment_type AS ENUM ('ai_generated', 'professor_edited', 'professor_written');

CREATE TABLE question_comments (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id  uuid REFERENCES questions(id) ON DELETE CASCADE,
  author_id    uuid REFERENCES auth.users(id),
  type         comment_type NOT NULL DEFAULT 'professor_written',
  content      text NOT NULL,
  model_used   text,                  -- claude-opus-4-7 ou null se escrito pelo professor
  is_published boolean DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE comment_images
  ADD CONSTRAINT fk_comment_images_comment
  FOREIGN KEY (comment_id) REFERENCES question_comments(id) ON DELETE CASCADE;

-- ============================================================
-- CAMADA 5 — Simulados
-- ============================================================

CREATE TABLE simulados (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        text NOT NULL,
  created_by   uuid REFERENCES auth.users(id),
  exported_at  timestamptz,
  export_path  text,                  -- exports bucket (signed URL 24h)
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX idx_simulados_creator ON simulados(created_by);

CREATE TABLE simulado_questions (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  simulado_id  uuid REFERENCES simulados(id) ON DELETE CASCADE,
  question_id  uuid REFERENCES questions(id) ON DELETE RESTRICT,
  position     int NOT NULL,
  note         text,                  -- nota do professor visível no export
  created_at   timestamptz DEFAULT now(),
  UNIQUE(simulado_id, question_id),
  UNIQUE(simulado_id, position)
);

-- ============================================================
-- FILA DE JOBS — Pipeline de IA
-- ============================================================

CREATE TYPE job_type AS ENUM ('parse_gabarito', 'extract', 'classify', 'comments', 'generate');
CREATE TYPE job_status AS ENUM ('pending', 'running', 'done', 'error', 'cancelled');

CREATE TABLE jobs (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id      uuid REFERENCES exams(id) ON DELETE CASCADE,
  question_id  uuid REFERENCES questions(id) ON DELETE CASCADE,
  type         job_type NOT NULL,
  status       job_status NOT NULL DEFAULT 'pending',
  payload      jsonb,
  result       jsonb,
  error        text,
  attempts     int DEFAULT 0,
  max_attempts int DEFAULT 3,
  created_at   timestamptz DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

CREATE INDEX idx_jobs_pending ON jobs(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_jobs_exam    ON jobs(exam_id);

-- ============================================================
-- PERFIS DE USUÁRIO (complementa auth.users)
-- ============================================================

CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'professor', 'analista');

CREATE TABLE user_profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       user_role NOT NULL DEFAULT 'analista',
  full_name  text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger: cria perfil automaticamente no signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- RLS — Row Level Security (base — expandir por feature)
-- ============================================================

ALTER TABLE exam_boards         ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialties         ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_keys         ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_images     ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_images      ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags                ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_revisions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulados           ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulado_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles       ENABLE ROW LEVEL SECURITY;

-- Política base: usuário autenticado lê tudo (refinar por role na Fase 6)
CREATE POLICY "authenticated_read_all" ON exam_boards    FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON specialties    FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON exams          FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON answer_keys    FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON questions      FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON question_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON taxonomies     FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON tags           FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON question_tags  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON question_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON simulados      FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON simulado_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_all" ON user_profiles  FOR SELECT TO authenticated USING (true);
CREATE POLICY "own_profile"            ON user_profiles  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Seed inicial: banca AMIB + especialidade UTI
INSERT INTO exam_boards (name, slug) VALUES ('AMIB', 'amib');
INSERT INTO specialties (exam_board_id, name, slug)
  SELECT id, 'Medicina Intensiva', 'medicina-intensiva' FROM exam_boards WHERE slug = 'amib';
