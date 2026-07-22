# Schema REAL de produção — MedMaestro

> Gerado a partir do banco vivo (projeto `ibavtxzlejizsbtztyvl`) em **2026-07-22**,
> durante a auditoria. Este arquivo é a **fonte de verdade** do esquema — a pasta
> `supabase/migrations/` está defasada (colunas/enums antigos, dois arquivos `005_*`)
> e NÃO reconstrói o banco de produção. Antes de escrever código que toca o banco,
> confira aqui (ou rode um SELECT no banco vivo).

## Enums (públicos, do app)

| Enum | Valores |
|---|---|
| `question_status` | `pending_extraction`, `pending_review`, `in_review`, `pending_approval`, `approved`, `published`, `rejected`, `needs_attention`, `draft`, `flagged` — ⚠ NÃO existe `extracted` |
| `image_scope_enum` | `statement`, `alternative_a` … `alternative_e` |
| `image_type_enum` | `ecg`, `radiografia`, `tomografia`, `ultrassom`, `grafico_pv`, `grafico_guyton`, `grafico_ventilacao`, `capnografia`, `rotem`, `eeg`, `tabela`, `esquema`, `outro` |
| `comment_type` | `explicacao`, `pegadinha`, `referencia`, `mnemonico`, `atualizacao_conduta`, `dica_professor` |
| `tag_dimension` | `modulo`, `tipo_questao`, `recurso_visual`, `dificuldade`, `habilidade`, `topico_edital` |
| `taxonomy_scope` | `internal`, `edital` |
| `attempt_status` | `em_andamento`, `entregue`, `expirado` |
| `campaign_access_mode` | `imediato`, `data_unica`, `janela` |
| `campaign_status` | `rascunho`, `publicada`, `despublicada` |
| `gabarito_flag_status` | `aberto`, `revisado` |
| `lead_segment` | `ja_aluno`, `nao_aluno`, `aluno_outro_curso` |
| `conversion_provider` / `conversion_status` | `meta`,`google` / `enviado`,`falha` |

## CHECK constraints importantes

- `questions.extraction_confidence`: **1 a 5** (não 0–100)
- `questions.correct_answer`: A–E
- `questions.extraction_method`: `vision` | `text` | `ocr` | `recovery` | `import`
- `question_tags.added_by_type`: `ai_auto` | `human_review`
- `question_tags.ai_confidence`: 1–5
- `flashcard_tags.added_by_type` e `question_variation_tags.added_by_type`: `inherited` | `ai_auto` | `human_review`
- `flashcards.card_type`: `qa` | `cloze` | `image_occlusion`; `difficulty`: 1–5
- `question_variations.difficulty_delta`: **0 a 2** (não há delta negativo)
- `question_attachments.mime_type` (`mime_allowed`): apenas `image/png`, `image/jpeg`, `image/webp`, `application/pdf` — DOCX/PPTX são rejeitados
- `question_comments.status`: `draft` | `approved` | `rejected`
- `answer_keys.correct_answer`: A–E | `ANULADA`
- `exams.status` (text): `pending` | `extracting` | `classifying` | `done` | `error`

## Tabelas (colunas reais)

### Núcleo de questões

```
questions
  id uuid PK · exam_id uuid FK · question_number int
  stem text NOT NULL · alternatives jsonb NOT NULL · correct_answer text
  status question_status NOT NULL DEFAULT 'pending_extraction'
  has_images bool · extraction_confidence smallint (1-5) · extraction_model text
  extraction_method text DEFAULT 'vision' · stem_tsv tsvector
  stem_html text · alternatives_html jsonb
  external_id text · import_source text · doc_taxonomy jsonb · extracted_tables jsonb
  UNIQUE(exam_id, question_number)

question_images
  id uuid PK · question_id uuid FK NOT NULL
  image_scope image_scope_enum NOT NULL · image_type image_type_enum DEFAULT 'outro'
  full_page_path text NOT NULL · cropped_path text · use_cropped bool
  bounding_box jsonb · ai_description text · figure_number smallint DEFAULT 1
  page_number int

answer_keys
  id uuid PK · exam_id uuid NOT NULL · question_number int NOT NULL
  correct_answer text NOT NULL · notes text
  UNIQUE(exam_id, question_number) — trigger sync_correct_answers() propaga p/ questions

question_comments
  id uuid PK · question_id uuid NOT NULL
  comment_type comment_type DEFAULT 'explicacao' · content text NOT NULL
  source text · created_by_ai bool · ai_model text · reviewed_by uuid
  status text DEFAULT 'draft' (draft|approved|rejected)

question_attachments   (storage_path, file_name, mime_type*, size_bytes, caption)
question_revisions     (question_id, revision_number, snapshot jsonb, change_reason)
review_assignments     (question_id, assigned_to, status DEFAULT 'assigned', expires_at)
gabarito_flags         (question_id, reason, status aberto|revisado)
comment_images         (question_id, full_path, caption, sort_order)
```

### Exames e taxonomia

```
exams
  id uuid PK · board_id uuid · specialty_id uuid · year int · booklet_color text
  source_pdf_path · answer_key_pdf_path · answer_key_color
  status text DEFAULT 'pending' · auto_comments text DEFAULT 'none'
  extraction_progress jsonb · extractor_id text
  source_format text DEFAULT 'pdf' · source_original_path text

exam_boards   (slug, name, short_name, supports_booklet_colors, default_specialty_id)
specialties   (slug, name)
taxonomies    (slug, name, scope internal|edital, board_id, specialty_id, year, is_active)
tags          (taxonomy_id, dimension, slug, label, parent_tag_id, color, display_order, is_active)
question_tags (question_id, tag_id UNIQUE, added_by_type ai_auto|human_review, ai_confidence 1-5)
```

### Variações e flashcards

```
question_variations
  id uuid PK · source_question_id uuid NOT NULL
  stem text · alternatives jsonb · correct_answer text · rationale text
  difficulty_delta smallint 0-2 · ai_model text
  approved bool DEFAULT false · approved_by · approved_at
  promoted_question_id uuid  — ao promover, vira questions com question_number >= 1000

question_variation_tags (variation_id, tag_id, added_by_type inherited|ai_auto|human_review)

flashcards
  id uuid PK · source_question_id uuid
  front text · back text · card_type qa|cloze|image_occlusion · difficulty 1-5
  ai_model · created_by_ai bool DEFAULT true · approved bool DEFAULT false
  approved_by · approved_at · srs_ease numeric · srs_interval int · srs_due_at · srs_reviews

flashcard_tags (flashcard_id, tag_id, added_by_type)
```

### Simulados, campanhas e camada aluno

```
simulados            (title, created_by, filters_used jsonb, total_questions, export_path)
simulado_questions   (simulado_id, question_id, position UNIQUE, note) — aponta SÓ para questions
campaigns            (simulado_id, name, duration_minutes, access_mode, window_*, releases jsonb,
                      status rascunho|publicada|despublicada, live_url, tracking jsonb)
campaign_form        (campaign_id, fields jsonb, embed_id, allowed_domains[], require_email_verification)
campaign_reminders   (campaign_id, type, sent_at, recipients)
campaign_module_stats(campaign_id, dimension, tag_id, correct, total)
simulado_attempts    (user_id, campaign_id, time_remaining, status attempt_status, deadline_at, was_paused)
question_attempts    (attempt_id, question_id, selected_alt char, is_saved, time_spent)
attempt_results      (attempt_id, score, completed_single_run, finished_at)
practice_attempts    (user_id, question_id, selected_alt, is_correct)
question_stats       (question_id, empirical_difficulty, response_count, is_reliable)
student_module_stats (user_id, dimension, tag_id, correct, total)
student_goals        (user_id, daily_goal) · student_dismissed_cards (user_id, question_id)
question_doubts      (question_id, user_id, campaign_id, text)
question_answer_distribution (question_id, campaign_id, counts jsonb)
leads                (campaign_id, email, fields jsonb, segment, origin, unsubscribed_at)
lead_consents        (lead_id, consent_version, consented_at, origin_url)
conversion_events    (lead_id, provider meta|google, event_type, event_id, status)
```

### Infra

```
profiles   (id = auth.users.id, email, full_name, role text DEFAULT 'analista', phone, origin, is_student_of)
jobs       (type, exam_id, question_id, payload jsonb, status text, attempts, error, retry_after)
api_usage  (provider, model, operation, exam_id, question_id, input/output_tokens,
            cache_creation/read_input_tokens, cost_usd) — RLS off por design
audit_logs (entity_id, entity_type, user_id, action, before_data, after_data)
```

## Funções

`get_user_role()` · `claim_jobs(p_limit)` · `sync_correct_answers(p_exam_id)` ·
`audit_log_trigger()` · `update_updated_at()` · `handle_new_user()` ·
`search_questions(...)` (migration 010) · `recalc_calibration` · `recalc_analytics` ·
funções de sampling de simulado (migration 014/015).

## Como regenerar este arquivo

Via MCP do Supabase (somente leitura):

```sql
-- colunas
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position;
-- enums
SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)
FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid GROUP BY t.typname;
-- checks
SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace;
```
