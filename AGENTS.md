# AGENTS.md — MedMaestro

> Arquivo lido automaticamente em toda nova sessão do Antigravity.
> Define identidade, stack, schema real do banco, taxonomia, e convenções.
> Conteúdo procedural específico (extração, classificação, etc.) fica nas
> Skills em `.agents/skills/`.

## Identidade

**MedMaestro** é uma plataforma fechada de uso interno para preparação ao
exame de **Título de Especialista em Medicina Intensiva (TEMI/AMIB)**, edição
novembro 2026.

Cobre o ciclo completo: ingestão de cadernos históricos, classificação
curricular via tags, comentários editoriais por IA (múltiplos tipos por
questão), geração de variações, montagem de simulados, flashcards SRS,
revisão humana e exportação.

**Proprietário:** cardiologista e intensivista, **não-desenvolvedor**.
**Idioma:** português brasileiro para tudo visível ao usuário.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14+ (App Router, TypeScript, Tailwind) |
| Backend | Supabase (PostgreSQL 17.6, Auth, Storage, RLS, Edge Functions) |
| Orquestração | Next.js API Routes + fila em PostgreSQL (tabela `jobs` com `claim_jobs()`) |
| IA | Claude API (Sonnet padrão; Opus para casos críticos). Prompt caching ativo. |
| E-mail | Resend |
| Pipeline extração | Python 3.11+ (Pillow, anthropic SDK) chamado via `child_process` |
| Infra | Hostinger KVM2 VPS + Nginx + Certbot |

## Identificação técnica do Supabase

- **Project name:** `medmaestro`
- **Project ID:** `ibavtxzlejizsbtztyvl` (com Z entre `tx` e `le`)
- **Org:** `andrelima-coder's Org` (id: `eyybedmykvfosindhumr`)
- **Region:** `sa-east-1` (São Paulo)
- **Tier:** PRO (sem auto-pause)
- **Compute:** t4g.nano
- **Postgres:** 17.6
- ⚠️ Projeto antigo `temi-dashboard` (`adxmszrgysfnzgrrdnop`) está **INACTIVE** — ignorar referências antigas a ele.

## Schema do banco — referência completa

**24 tabelas + 6 enums + 6 funções** já em produção. Ver descrição detalhada em
`docs/schema_real.md` (gerado a partir do banco vivo).

### Tabelas principais

```
profiles                  # Usuários (FK auth.users), role text default 'analista'
exam_boards               # Concursos (AMIB, etc) com flag supports_booklet_colors
specialties               # Áreas (Medicina Intensiva, etc)
exams                     # Cadernos: (board_id, specialty_id, year, booklet_color) UNIQUE
                          # status text + extraction_progress JSONB + extractor_id
answer_keys               # Gabarito separado: (exam_id, question_number) UNIQUE
                          # Trigger sync_correct_answers() popula questions.correct_answer

questions                 # Questão original
                          # (exam_id, question_number) UNIQUE
                          # stem text + stem_html + stem_tsv (full-text)
                          # alternatives JSONB {"A":"...","B":"...",...} + alternatives_html
                          # status enum question_status (8 estados)
                          # has_images bool, extraction_confidence smallint 0-100
                          # extraction_method text default 'vision'

question_images           # Imagens das questões
                          # (question_id, image_scope, figure_number) UNIQUE
                          # full_page_path (NOT NULL) + cropped_path + use_cropped flag
                          # bounding_box JSONB
                          # image_scope enum (statement, alternative_a..e)
                          # image_type enum (ecg, radiografia, etc) default 'outro'

question_attachments      # Anexos rich text de comentários (storage_path + caption)
comment_images            # Imagens em comentários

taxonomies                # Conjuntos de tags. Atual: 'medmaestro_v1'
tags                      # Tags com hierarquia parent_tag_id
                          # dimension enum (modulo, tipo_questao, recurso_visual,
                          #                 dificuldade, habilidade, topico_edital)
question_tags             # m2m. (question_id, tag_id) UNIQUE
                          # added_by_type ('ai'/'human'), ai_confidence smallint

question_comments         # Múltiplos por questão!
                          # comment_type enum (explicacao, pegadinha, referencia,
                          #                    mnemonico, atualizacao_conduta)
                          # status text ('draft'/'published'/...)
                          # created_by_ai bool, ai_model text, reviewed_by uuid

question_revisions        # Histórico de versões de questions
review_assignments        # Atribuição de revisão a usuários

question_variations       # Variações geradas por IA da source_question_id
                          # difficulty_delta smallint (signed: -1 mais fácil, +1 mais difícil)
                          # approved bool, promoted_question_id (vira questions ao promover)
question_variation_tags   # tags das variações (espelho de question_tags)

flashcards                # SRS cards. front/back, source_question_id
                          # srs_ease numeric, srs_interval int, srs_due_at, srs_reviews
                          # approved + approved_by para gate humano
flashcard_tags

simulados                 # title + filters_used JSONB + total_questions + export_path
simulado_questions        # (simulado_id, position) UNIQUE
                          # ⚠️ aponta SÓ para questions (não para variations).
                          # Variation precisa ser promovida antes de entrar em simulado.

jobs                      # Fila simples mas robusta:
                          # type, payload JSONB, status, attempts, error, retry_after
                          # Função claim_jobs() faz dequeue atômico

api_usage                 # Tracking de custo Claude API (RLS desabilitado)
                          # input_tokens + output_tokens +
                          # cache_creation_input_tokens + cache_read_input_tokens
                          # cost_usd numeric

audit_logs                # Trilha imutável (701+ rows). Trigger audit_log_trigger.
```

### Enums (6)

| Enum | Valores |
|---|---|
| `question_status` | `pending_extraction`, `pending_review`, `in_review`, `pending_approval`, `approved`, `published`, `rejected`, `needs_attention` |
| `image_scope_enum` | `statement`, `alternative_a`, `alternative_b`, `alternative_c`, `alternative_d`, `alternative_e` |
| `image_type_enum` | `ecg`, `radiografia`, `tomografia`, `ultrassom`, `grafico_pv`, `grafico_guyton`, `grafico_ventilacao`, `capnografia`, `rotem`, `eeg`, `tabela`, `esquema`, `outro` |
| `tag_dimension` | `modulo`, `tipo_questao`, `recurso_visual`, `dificuldade`, `habilidade`, `topico_edital` |
| `taxonomy_scope` | `internal`, `edital` |
| `comment_type` | `explicacao`, `pegadinha`, `referencia`, `mnemonico`, `atualizacao_conduta` |

### Funções existentes

| Função | Uso |
|---|---|
| `get_user_role()` | Retorna role do usuário autenticado (usado em RLS policies) |
| `claim_jobs(...)` | Dequeue atômico de jobs com retry |
| `sync_correct_answers()` | Sincroniza `answer_keys.correct_answer` → `questions.correct_answer` |
| `audit_log_trigger()` | Trigger function de audit |
| `update_updated_at()` | Trigger genérico |
| `handle_new_user()` | Trigger pra criar profile quando user signa em |

## Taxonomia curricular real (`medmaestro_v1`)

26 tags ativas em 4 dimensões. **Use sempre os `tag_slug` exatos abaixo.**

### Dimensão `modulo` (10 módulos — não 12 como em planos antigos)

```
cardiovascular            # Cardiovascular
respiratorio              # Respiratório
neurologico               # Neurológico
renal                     # Renal e Distúrbios HE (inclui endócrino básico)
infeccioso                # Infectologia e Sepse
gastro_nutricao           # Gastro e Nutrição
hemato_onco               # Hemato e Oncologia
trauma_cirurgia           # Trauma e Cirurgia (inclui toxicologia)
medicina_perioperatoria   # Medicina Perioperatória
etica_qualidade           # Ética e Qualidade (inclui MBE e gestão)
```

### Dimensão `tipo_questao` (5 tipos)

```
conduta, diagnostico, fisiopatologia, farmacologia, interpretacao
```

### Dimensão `recurso_visual` (8 tags)

```
sem_imagem, ecg, radiografia, tomografia, ultrassom, grafico, tabela, outros
```

### Dimensão `dificuldade` (3 níveis)

```
facil, medio, dificil
```

### Dimensões previstas mas vazias

- `habilidade` — sem tags ainda
- `topico_edital` — sem tags ainda

Quando criar tags novas: insira em `tags` referenciando `taxonomy_id` da
`medmaestro_v1`. Use `parent_tag_id` para hierarquia (subtemas).

## Estado atual do pipeline (snapshot)

Estado dos 3 cadernos cadastrados em `exams`:

| Year | Color | Status | Phase | Progress |
|---|---|---|---|---|
| 2024 | amarelo | `classifying` | `commenting` | 48/90 comentários |
| 2025 | rosa | `error` | `error` | 90 questões salvas com erros parciais |
| 2026 | rosa | `error` | `error` | 0 questões — provável teste falhado |

Counters totais: **180 questões + 90 answer_keys + 35 question_images +
50 question_comments + 332 question_tags + 701 audit_logs**.

`extractor_id = 'amib_temi'` em todos.

## Convenções de uso de MCP

### Supabase MCP
- Sempre use para: SQL, DDL, RLS, storage, list de tables/migrations.
- DDL → `apply_migration` (com `name`, `query`, `project_id`).
- SELECTs → `execute_sql`.
- **Antes de qualquer operação destrutiva** (DROP, DELETE em massa): pedir
  confirmação explícita.
- Project_id correto: `ibavtxzlejizsbtztyvl`.

### Naming convenções (importante!)

Nomes que diferem do que pode estar em planos antigos:

| Plano antigo | Real |
|---|---|
| `batches` | `exams` |
| `num_questao` | `question_number` |
| `statement` | `stem` (+ `stem_html`, `stem_tsv`) |
| `alternative_a..e` (5 colunas) | `alternatives` (1 JSONB) |
| `correct_answer` em questions | `answer_keys` (tabela separada) |
| `confidence` 0.0-1.0 | `extraction_confidence` smallint **0-100** |
| `precisa_vision` + `motivo_vision` | `extraction_method` text default `'vision'` |
| `generated_questions` | `question_variations` |
| `mock_exams` | `simulados` |
| `comment_alt_a..e` + `comment_compiled` | múltiplos `question_comments` por tipo |
| `auto_comments` modo `'hibrido'` | modo `'hybrid'` (em inglês) |
| `M1`–`M12` | tags com `dimension='modulo'` (10 slugs) |

## Convenções de código

1. **TypeScript strict mode**. Sem `any`. Sem `@ts-ignore`.
2. **Server Components por padrão**. `'use client'` só quando necessário.
3. **Supabase queries no server** via `createServerClient`.
4. **React Query (TanStack)** para client-side data fetching.
5. **Recharts** para gráficos (tema dark).
6. **Lucide React** para ícones.
7. **Zod** para validação de forms e API inputs.
8. **Nunca hardcodar textos** — usar `lib/utils/constants.ts`.
9. **Audit trail obrigatório**: trigger `audit_log_trigger` cuida na maioria
   das tabelas; verificar antes de adicionar tabela nova.
10. **Português nos enums de display** — mapear via constants.
11. **Logging de custos**: toda chamada Claude registra em `api_usage` com
    `cache_creation_input_tokens` + `cache_read_input_tokens`.

## Convenções de segurança

- Nunca commit de `.env`, chaves de API.
- Nunca expor `service_role_key` no frontend — só `anon_key`.
- `api_usage` tem RLS desabilitado por design (worker server-side escreve direto).
- Migrations destrutivas em produção: aprovação explícita do usuário.
- Operações em massa (DELETE/UPDATE em >100 rows): preview obrigatório.

## Design system (frontend)

Layout baseado no Nexus SaaS Dashboard. Tokens completos em
`.agents/skills/medmaestro-frontend-component/SKILL.md`.

Resumo:
- Background: `#0A0A0A` / `#111D35`
- Accent: gold `#C9A84C` + orange `#FF6B35`
- Tipografia: Syne (headings) + DM Sans (body)
- Border-radius: 12px

## Achados técnicos sobre os cadernos físicos

(Sobre os arquivos `.pdf` que você importa, **não sobre o banco**.)

1. Os arquivos `.pdf` em `extracao/cadernos/` são **ZIPs renomeados**. Cada
   um contém `N.jpeg`, `N.txt` (OCR) e `manifest.json` com `has_visual_content`.
2. **Qualidade do OCR varia drasticamente**:
   - **Bom** (≥90% das alternativas detectáveis): TEMI 2020, 2024, 2025-rosa
   - **Degradado** (perdeu letras das alternativas): TEMI 2021, 2022, 2023
   - **Vazio** (Vision-only): PROVA_TEC 2025
3. **3 formatos de marcação** (auto-detectáveis):
   - Formato A: `QUESTÃO 08` + `A.` `B.` (TEMI 2021/2024/2025-rosa)
   - Formato B: `01.` + `a)` `b)` (TEMI 2020)
   - Formato C: `Questão 5` + `a.` `b.` (TEMI 2022/2023)
4. **Casos clínicos compartilhados NÃO são usados** em TEMI 2020-2025
   (verificado por inspeção). Cada questão é independente.

Mais detalhes em `.agents/skills/temi-question-extractor/resources/conhecimento_cadernos.md`.

## Quando o usuário disser "Sessão X.Y"

Refere-se ao plano de implementação em `docs/plano_implementacao.html` (se
existir). Convenções:
- Tarefas marcadas como **"Claude"**: executar diretamente
- Tarefas marcadas como **"Você"**: instruir o usuário
- Tarefas marcadas como **"Ambos"**: executar e pedir validação

## Mapa de Skills disponíveis

| Pedido típico | Skill que carrega |
|---|---|
| "extraia o caderno X" / "rode WF01" | `temi-question-extractor` |
| "classifique as questões do exam X" / "atribua tags" | `temi-question-classifier` |
| "gere comentários" / "explique questões com IA" | `temi-question-commenter` |
| "gere variações da questão Y" / "rode WF04" | `temi-question-generator` |
| "monte um simulado" / "crie prova nova" | `temi-mock-exam-builder` |
| "exporte em PDF/DOCX" | `temi-export` |
| "crie um KPI card" / "estilize com tokens" | `medmaestro-frontend-component` |

## Anti-padrões — não faça

- ❌ Resolver questão no mesmo turno em que extrai. Extração e resolução são
  pipelines separados (reduz custo e evita contaminação).
- ❌ Gravar gabarito direto em `questions.correct_answer` — escreva em
  `answer_keys`. A trigger `sync_correct_answers()` propaga.
- ❌ Misturar texto de várias questões num mesmo `stem`.
- ❌ Reordenar alternativas alfabeticamente — preserva ordem original (a
  letra do gabarito depende disso).
- ❌ Inventar valores fora dos enums (ver lista acima).
- ❌ Marcar `status='published'` em questão com `has_images=true` sem
  revisão editorial humana.
- ❌ Inserir `simulado_questions` apontando para `question_variations`
  diretamente — promova primeiro (set `promoted_question_id`).
- ❌ Esquecer de registrar uso em `api_usage` em chamadas Claude.
- ❌ Confiar em OCR para reconhecer figuras médicas (ECGs, TCs, gráficos):
  use Vision olhando a imagem original.

## Estado da configuração

- ✅ Schema v1 no banco (24 tabelas, 6 enums, 6 funções) — produção
- ✅ 18 migrations aplicadas (última: `005_api_usage`)
- ✅ Pipeline `extractor_id='amib_temi'` rodando para TEMI 2024 amarelo
- ✅ Taxonomia `medmaestro_v1` populada com 26 tags
- ⏳ TEMI 2024 amarelo: comentários 48/90 (em andamento)
- ❌ TEMI 2025 rosa: status `error`, 90 questões parciais — investigar
- ❌ TEMI 2026 rosa: status `error`, 0 questões — falha de extração
- ⏳ Auth Supabase com bug "login is not defined" (mencionado em sessão anterior)
