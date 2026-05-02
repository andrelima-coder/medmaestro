# Guia de Migração v1 → v2

> Documento explicando o que mudou entre o projeto modular v1 (entregue em
> sessões anteriores) e a v2 (esta).
>
> Tempo estimado de migração no seu repositório: ~5 minutos.

## Contexto da mudança

A v1 foi desenhada **antes** de inspeção direta do banco. A v2 foi gerada
**após** inspeção do schema real no Supabase project `ibavtxzlejizsbtztyvl`.

Resultado: o schema real tem **24 tabelas + 6 enums + 6 funções** bem mais
sofisticado que o projetado. Várias decisões de design dele são **melhores**
que as minhas originais (ex: `answer_keys` separado, `question_images`
com full_page+cropped, taxonomies hierárquicas).

## Diff de schema — o que renomear

| v1 (skill antiga) | v2 (real) | Por quê |
|---|---|---|
| `batches` | `exams` | Nome real da tabela |
| `num_questao` | `question_number` | Nome real |
| `statement` | `stem` (+ `stem_html`, `stem_tsv`) | Real tem rich text e tsvector |
| `alternative_a..e` (5 colunas) | `alternatives` JSONB | Mais flexível |
| `correct_answer` em questions | `answer_keys` (tabela separada) | Resiliente a mudança de numeração |
| `confidence` float 0-1 | `extraction_confidence` smallint **0-100** | Tipo real |
| `precisa_vision` + `motivo_vision` | `extraction_method` text | 1 campo cobre os 2 |
| `auto_comments='hibrido'` | `auto_comments='hybrid'` | Inglês no banco real |
| `image_role='principal'` | `image_scope='statement'` | Enum real |
| `generated_questions` | `question_variations` | Nome real |
| `mock_exams` / `mock_exam_items` | `simulados` / `simulado_questions` | Nome real |
| `comment_alt_a..e` + `comment_compiled` | múltiplos `question_comments` (5 tipos) | Modelo educacional melhor |
| Enum `M1`–`M12` | tags com `dimension='modulo'` (10 slugs) | Sem DDL pra novo módulo |
| `pareto_view` | (no app) | Não existe no banco — agregação no frontend |

## Diff de tabelas — o que ganhamos na v2

Tabelas que existem no real e não estavam na v1:

- `exam_boards` + `specialties` — concursos e áreas como referência
- `taxonomies` + `tags` + `question_tags` — sistema de tags hierárquico
- `question_revisions` — histórico de versões de questões
- `review_assignments` — atribuição formal de revisão
- `comment_images` — imagens em comentários
- `flashcards` + `flashcard_tags` — Anki-like com SRS
- `question_attachments` — anexos rich text
- `question_variation_tags` — tags das variações
- `api_usage` — tracking de prompt caching tokens
- `audit_logs` — trilha imutável (701+ rows já)
- `jobs` — fila com retry/claim atômico

## Diff de enums

Novos enums no real que a v1 não tinha:

| Enum | Valores |
|---|---|
| `comment_type` | explicacao, pegadinha, referencia, mnemonico, atualizacao_conduta |
| `tag_dimension` | modulo, tipo_questao, recurso_visual, dificuldade, habilidade, topico_edital |
| `taxonomy_scope` | internal, edital |
| `question_status` (8 estados) | pending_extraction, pending_review, in_review, pending_approval, approved, published, rejected, needs_attention |
| `image_scope_enum` | statement, alternative_a..e |
| `image_type_enum` (médico-específico) | ecg, radiografia, tomografia, ultrassom, grafico_pv, grafico_guyton, grafico_ventilacao, capnografia, rotem, eeg, tabela, esquema, outro |

## Diff de taxonomia

A taxonomia real (`medmaestro_v1`) é **mais consolidada**:

| v1 (proposto) | v2 (real) |
|---|---|
| 12 módulos M1–M12 | **10 slugs** |
| Tinha M9 Toxicologia separado | Inclusa em `trauma_cirurgia` |
| Tinha M10 Endócrino separado | Endócrino básico vai em `renal` |
| Tinha M11 MBE/Estatística separado | Inclusa em `etica_qualidade` |
| Tinha M12 Gestão separado | Inclusa em `etica_qualidade` |
| Não tinha | **Novos: hemato_onco, medicina_perioperatoria** |
| 4 níveis dificuldade | **3 níveis** (facil, medio, dificil) |

## Como aplicar a migração

### Passo 1 — Backup do estado atual

```bash
# Da raiz do seu projeto:
cp AGENTS.md AGENTS.md.v1.bak
cp -r .agents .agents.v1.bak
```

### Passo 2 — Substituir AGENTS.md e skills

```bash
# Extraia este ZIP (projeto_modular_v2.zip) na raiz do projeto
# Ele contém: AGENTS.md, .agents/, README, etc.

unzip projeto_modular_v2.zip -d /tmp/v2
cp /tmp/v2/projeto_modular_v2/AGENTS.md ./AGENTS.md
rm -rf .agents/skills .agents/workflows
cp -r /tmp/v2/projeto_modular_v2/.agents/* .agents/
```

### Passo 3 — Migration v1.1 está obsoleta

Se você tinha o arquivo `supabase/migrations/v1_1_extracao_metadata.sql`
da v1, **remova-o**. O schema real já cobre os campos necessários
(`extraction_method`, `extraction_progress`, etc.) — não há nada a aplicar.

```bash
rm -f supabase/migrations/v1_1_extracao_metadata.sql
```

### Passo 4 — Setup Python

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Passo 5 — Validação

```bash
# Smoke test do Estágio 3 v2 (zero rede, valida fluxo)
SUPABASE_URL=https://fake.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=fake \
python3 .agents/skills/temi-question-extractor/scripts/stage3_persistencia.py \
    --input <um JSON do Estágio 2 que você tenha> \
    --caderno-extracted <diretório com JPEGs> \
    --year 2024 --booklet-color amarelo \
    --dry-run
```

Esperar ver:
- "[DRY-RUN] upsert em exams: 1 rows (on_conflict=board_id,specialty_id,year,booklet_color)"
- "[DRY-RUN] upsert em questions: ... (on_conflict=exam_id,question_number)"
- "[DRY-RUN] upsert em answer_keys: ... (on_conflict=exam_id,question_number)"
- "[DRY-RUN] upsert em question_images: ... (on_conflict=question_id,image_scope,figure_number)"

Se vir esses 4 padrões, o stage 3 está alinhado.

### Passo 6 — Iniciar nova sessão no Antigravity

O novo `AGENTS.md` será lido automaticamente. Verifique a saída do agente
nas primeiras mensagens — ele deve referenciar o project_id correto
(`ibavtxzlejizsbtztyvl`) e a taxonomia `medmaestro_v1` com 10 módulos.

## Perguntas frequentes

### "Preciso re-extrair os cadernos antigos?"

Não. Os 180 questões já no banco continuam válidas. A v2 só atualiza
**como** novas extrações acontecem.

### "E o caderno 2024 amarelo que está em fase `commenting` 48/90?"

Continua de onde parou. A v2 não muda nada do que está em produção.

### "Se eu rodar o stage3 v2 num exam que já existe, duplica?"

Não. É idempotente:
- `exams` upserta em `(board_id, specialty_id, year, booklet_color)`
- `questions` upserta em `(exam_id, question_number)`
- `answer_keys` upserta em `(exam_id, question_number)`
- `question_images` upserta em `(question_id, image_scope, figure_number)`

### "Posso continuar usando a v1 das outras skills (classifier, commenter)?"

Não. Os SKILL.md da v1 referenciam tabelas/enums que **não existem** com
esse nome. O Claude vai gerar SQL inválido. Substitua tudo pela v2.
