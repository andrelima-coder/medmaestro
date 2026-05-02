---
name: temi-question-extractor
description: Extrai questões de cadernos históricos da prova TEMI/AMIB transformando ZIPs (com OCR + JPEGs) em registros estruturados nas tabelas exams, questions, answer_keys e question_images do Supabase. Use quando o usuário pedir para processar, extrair, indexar, parsear ou ingerir um caderno; quando pedir para popular o banco a partir de provas antigas; ou quando pedir para rodar o WF01 / Estágios 1, 2 ou 3.
---

# Skill — Extrator de Questões TEMI/AMIB (WF01)

Pipeline em 3 estágios desacoplados. Cada um re-executável independentemente.

## Quando ativar

- "extraia / processe / indexe / parseie o caderno YYYY"
- "popule o banco com a prova de YYYY"
- "rode o WF01" / "rode o Estágio N"
- "ingira esse PDF de prova"

## Conhecimento de domínio

Antes de qualquer ação, leia `resources/conhecimento_cadernos.md` para
entender:
- Os 4 formatos suportados (A/B/C/VISION_ONLY)
- A estrutura ZIP dos arquivos `.pdf`
- Onde o OCR é confiável vs onde precisa Vision
- Padrões de header/footer por caderno

## Schema-alvo no banco (LEIA ANTES DE TOCAR EM CÓDIGO)

O Estágio 3 escreve em **4 tabelas** com regras específicas:

### `exams` — o "lote" do caderno
- Chave única: `(board_id, specialty_id, year, booklet_color)`
- Antes de inserir, busque `board_id` (slug `'amib'`) e `specialty_id` (`'medicina-intensiva'`) — não invente UUID.
- `status` text: `'pending'` → `'extracting'` → `'extracted'` → `'classifying'` → `'commenting'` → `'published'` ou `'error'`
- `extraction_progress` JSONB com schema fixo:
  ```json
  {"phase": "indexing|vision|persisting|done|error",
   "total": int, "current": int,
   "message": "...", "updated_at": "ISO8601"}
  ```
- `extractor_id` text: convenção `'amib_temi'` para os cadernos atuais
- `auto_comments` text: `'none'` | `'simple'` | `'hybrid'` (não `'hibrido'`)

### `questions` — o registro principal
- Chave única: `(exam_id, question_number)`
- `stem` text NOT NULL (não `statement`)
- `alternatives` JSONB NOT NULL — **objeto** `{"A": "...", "B": "...", "C": "...", "D": "..."}`. Letras em maiúsculo. NÃO use array.
- `status` enum `question_status`:
  - Pós-extração sem revisão: `'pending_review'`
  - Pós-extração + classificação OK: `'pending_approval'`
  - Aprovada: `'approved'`
  - Publicada: `'published'`
- `has_images` (plural!) bool default false
- `extraction_confidence` smallint **0-100** (não float 0-1!) — multiplique por 100 antes de inserir
- `extraction_method` text default `'vision'` — substitui meu antigo `precisa_vision`+`motivo_vision`. Valores: `'vision'`, `'ocr'`, `'hybrid'`
- `extraction_model` text — ex: `'claude-sonnet-4-5'`
- `correct_answer` text — **não inserir aqui diretamente**, deixe a trigger `sync_correct_answers()` propagar de `answer_keys`

### `answer_keys` — gabarito separado
- Chave única: `(exam_id, question_number)`
- `correct_answer` text (`'A'`, `'B'`, etc)
- `notes` text opcional

### `question_images` — uma row por imagem
- Chave única: `(question_id, image_scope, figure_number)` — permite múltiplas figuras por scope
- `image_scope` enum: `'statement'` | `'alternative_a'`..`'alternative_e'`
- `image_type` enum default `'outro'`. Use o tipo correto:
  - `ecg`, `radiografia`, `tomografia`, `ultrassom`, `eeg`, `tabela`, `esquema`
  - `grafico_pv` (alça PV), `grafico_guyton`, `grafico_ventilacao`, `capnografia`, `rotem`
- `full_page_path` text **NOT NULL** — sempre salve a página inteira no Storage
- `cropped_path` text nullable — crop opcional
- `bounding_box` JSONB — flexível, recomendo `{"x": int, "y": int, "w": int, "h": int}` ou `{"bbox_pct": [x1,y1,x2,y2]}`
- `use_cropped` bool default false — frontend escolhe qual mostrar
- `figure_number` smallint default 1 — quando há 2 ECGs no enunciado: 1, 2

## Arquitetura — 3 estágios

| # | Estágio | Onde roda | Custo/Q | Saída |
|---|---|---|---|---|
| 1 | Indexação | Python local (`scripts/stage1_indexacao.py`) | Zero | JSON estruturado por caderno |
| 2 | Vision | Claude API (`scripts/stage2_vision.py`) | ~$0.01 | JSON com stem limpo + bbox |
| 3 | Persistência | Supabase REST (`scripts/stage3_persistencia.py`) | Zero | INSERTs em exams/questions/answer_keys/question_images + uploads |

## Como invocar

### Modo 1 — CLI (desenvolvimento local)

```bash
# Estágio 1
python .agents/skills/temi-question-extractor/scripts/stage1_indexacao.py \
  --caderno extracao/cadernos/temi_2024_amarelo.pdf \
  --output extracao/output/temi_2024_stage1.json

# Estágio 2 — só nas questões marcadas precisa_vision=true
python .agents/skills/temi-question-extractor/scripts/stage2_vision.py \
  --input extracao/output/temi_2024_stage1.json \
  --output extracao/output/temi_2024_completo.json

# Estágio 3 — dry-run primeiro
python .agents/skills/temi-question-extractor/scripts/stage3_persistencia.py \
  --input extracao/output/temi_2024_completo.json \
  --caderno-extracted extracao/work/temi_2024/ \
  --year 2024 --booklet-color amarelo \
  --dry-run

# Após review do dry-run
python .agents/skills/temi-question-extractor/scripts/stage3_persistencia.py \
  --input ... --caderno-extracted ... --year 2024 --booklet-color amarelo \
  --commit
```

### Modo 2 — API Route Next.js (produção, em uso)

```http
POST /api/extract
Content-Type: application/json

{ "exam_id": "uuid", "stage": "all" | "indexacao" | "vision" | "persist" }
```

A rota enfileira em `jobs` com `type='extract'` e o worker (`claim_jobs()`)
processa atualizando `exams.extraction_progress` em real-time
(via Realtime publication).

## Decisão automática "precisa Vision?"

O Estágio 1 marca cada questão com `extraction_method` baseado em sinais:

| Sinal | extraction_method |
|---|---|
| Alternativas são imagens (3+ letras soltas no OCR) | `'vision'` |
| OCR perdeu letras das alternativas (texto >250 chars, zero matches A-E) | `'vision'` |
| Página tem visual + enunciado referencia figura/tabela | `'vision'` |
| <4 alternativas detectadas no OCR | `'vision'` |
| OCR tem 4 alternativas legíveis E sem figura referenciada | `'ocr'` |

## Regras de ouro da extração (invariantes)

1. **Não resumir** o enunciado — copie exatamente como está.
2. **Não corrigir** erros de português originais — podem ser pegadinha.
   Corrija apenas erros óbvios de OCR (caracteres trocados).
3. **Preservar unidades e valores exatos**: `Hb 8,5 g/dL`, `PaCO2 35 mmHg`,
   `RASS -3` — nunca converter ou resumir.
4. **Manter ordem original** das alternativas. A letra do gabarito depende disso.
5. **Bbox em percentual da imagem (0-100)**, nunca em pixels.
6. **Sempre salvar `full_page_path`** — mesmo que tenha um crop bom, a página
   inteira fica como fallback (`use_cropped=true` quando o crop é confiável).
7. **Figuras médicas via Vision olhando imagem original** — OCR não captura.

## Métricas de qualidade — gates obrigatórios

Após cada extração, validar antes do gate humano:

| Métrica | Target | Ação se abaixo |
|---|---|---|
| `pct_alternativas_4_letras` | ≥ 90% | Revisar prompt do Estágio 2 |
| `pct_match_gabarito` | ≥ 95% (quando `answer_keys` está populado) | Calibrar Estágio 2 |
| `pct_confidence_>=85` | ≥ 80% | Sinalizar amostra para revisão humana |

## Persistência no Supabase — fluxo do Estágio 3

```
1. Resolve / cria exam (com FKs corretas para board e specialty)
2. ensure_bucket_exists para 'question-images'
3. Para cada questão:
   a. Upload da página full original → Storage path: '<exam_slug>/q<NNN>_full.jpg'
   b. (opcional) Crop dos bbox principais → Storage path: '<exam_slug>/q<NNN>_<scope>_<fig>.jpg'
   c. UPSERT em questions on (exam_id, question_number)
   d. UPSERT em answer_keys on (exam_id, question_number) -- gabarito
   e. UPSERT em question_images on (question_id, image_scope, figure_number)
   f. INSERT em audit_logs (via trigger automático)
4. Update exam.extraction_progress phase='done'
```

## Recursos disponíveis

| Arquivo | Conteúdo |
|---|---|
| `resources/conhecimento_cadernos.md` | Detalhes técnicos sobre os ZIPs e OCR |
| `resources/prompt_extracao_questao.md` | Prompt do Estágio 2 (versionável) |
| `resources/prompt_extracao_vision_only.md` | Prompt para PROVA_TEC 2025 |
| `scripts/stage1_indexacao.py` | Python, custo zero |
| `scripts/stage2_vision.py` | Python orquestrando Claude API |
| `scripts/stage3_persistencia.py` | **Persistência Supabase com schema real**, idempotente, dry-run |
| `scripts/lib/supabase_client.py` | Wrapper REST (PostgREST + Storage) |
| `scripts/lib/image_processor.py` | Crops + otimização JPEG |

## Anti-padrões

- ❌ Inserir `correct_answer` direto em `questions` — use `answer_keys` (a trigger propaga)
- ❌ `alternatives` como array `["a","b",...]` — use objeto `{"A":"...","B":"..."}`
- ❌ `extraction_confidence` 0.85 (float) — use `85` (smallint 0-100)
- ❌ `auto_comments='hibrido'` (português) — use `'hybrid'` (inglês)
- ❌ Esquecer de subir o `full_page_path` (NOT NULL)
- ❌ Hardcodar `board_id` ou `specialty_id` — sempre buscar pelo slug
- ❌ Aplicar migration sem rodar verificação pós-migration

## Troubleshooting

| Sintoma | Causa provável | Onde olhar |
|---|---|---|
| Estágio 3 retorna FK constraint error em `exam_id` | Não criou exam antes de questions | Verificar fluxo `find_or_create_exam()` |
| Estágio 3 retorna check constraint em `extraction_confidence` | Você passou float 0.85 em vez de 85 | Multiplicar por 100 no `map_question_to_row()` |
| Trigger `sync_correct_answers` não propaga | Inseriu em `answer_keys` mas trigger não disparou | Verificar se o trigger existe (`pg_trigger`) e se exam_id+question_number batem |
| Imagem aparece sem o crop no frontend | `use_cropped=false` | Definir `true` quando `cropped_path` é confiável |
| `claim_jobs()` retorna vazio | Worker não pegou job (status != 'pending' ou retry_after no futuro) | Conferir job na tabela manualmente |
