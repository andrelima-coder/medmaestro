---
name: temi-question-classifier
description: Classifica questões da prova TEMI/AMIB atribuindo tags da taxonomia medmaestro_v1 (módulo, tipo_questao, recurso_visual, dificuldade) via question_tags. Use quando o usuário pedir para classificar questões, rodar o WF02, atribuir módulo/tema/dificuldade, ou processar a classificação de um exam. Trabalha questão por questão usando Claude Sonnet com a taxonomia carregada como contexto.
---

# Skill — Classificador via Tags (WF02)

Atribui tags multi-dimensionais às questões já extraídas, segundo a taxonomia
**`medmaestro_v1`** (10 módulos, 5 tipos, 8 recursos visuais, 3 dificuldades).

## Quando ativar

- "classifique as questões do exam X"
- "rode o WF02"
- "atribua tags às questões"
- "qual é o tema dessa questão?" (1-shot)

## Input requirements

Cada questão deve ter `status` ∈ {`pending_review`, `in_review`, `pending_approval`,
`approved`, `published`}. Questões em `pending_extraction` ainda têm risco de
alternativas incompletas — não classificar.

## Modelo

**Claude Sonnet** (não Opus). Use prompt caching:
- Bloco 1 (cacheado): system prompt com taxonomia inteira
- Bloco 2 (variável): a questão atual

Cache reduz custo em ~70% para batches.

## Schema-alvo

A classificação produz **rows em `question_tags`** (1 row por tag atribuída).
Cada row:

```json
{
  "question_id": "uuid",
  "tag_id": "uuid",
  "added_by_type": "ai",
  "added_by": null,           // só preenchido se humano (uuid do user)
  "ai_confidence": 87         // smallint 0-100
}
```

**Constraint único:** `(question_id, tag_id)` — não duplica tag.

## Taxonomia atual (memorizar slugs exatos)

### Dimensão `modulo` (10 — escolher 1)

| Slug | Label |
|---|---|
| `cardiovascular` | Cardiovascular |
| `respiratorio` | Respiratório |
| `neurologico` | Neurológico |
| `renal` | Renal e Distúrbios HE |
| `infeccioso` | Infectologia e Sepse |
| `gastro_nutricao` | Gastro e Nutrição |
| `hemato_onco` | Hemato e Oncologia |
| `trauma_cirurgia` | Trauma e Cirurgia |
| `medicina_perioperatoria` | Medicina Perioperatória |
| `etica_qualidade` | Ética e Qualidade |

### Dimensão `tipo_questao` (5 — escolher 1)

`conduta`, `diagnostico`, `fisiopatologia`, `farmacologia`, `interpretacao`

### Dimensão `recurso_visual` (8 — escolher 1)

`sem_imagem`, `ecg`, `radiografia`, `tomografia`, `ultrassom`, `grafico`,
`tabela`, `outros`

### Dimensão `dificuldade` (3 — escolher 1)

`facil`, `medio`, `dificil`

### Dimensões previstas mas vazias

`habilidade`, `topico_edital` — deixar para fase futura. Se quiser usar,
cadastrar tags primeiro.

## Como invocar

### Modo 1 — API Route Next.js

```http
POST /api/classify
{ "exam_id": "uuid", "concurrency": 5 }
```

A rota enfileira jobs em `jobs(type='classify_question')` e o worker processa
via `claim_jobs()`.

### Modo 2 — Direto via SQL (calibração)

```sql
-- Pegar questões pendentes de classificação
SELECT id, question_number, stem, alternatives, correct_answer
FROM questions q
LEFT JOIN question_tags qt ON qt.question_id = q.id
WHERE q.exam_id = $1
  AND qt.id IS NULL
  AND q.status IN ('pending_review','in_review','pending_approval','approved','published');
```

## Persistência

```sql
-- Para cada tag classificada:
INSERT INTO question_tags (question_id, tag_id, added_by_type, ai_confidence)
VALUES ($1, $2, 'ai', $3)
ON CONFLICT (question_id, tag_id) DO UPDATE
  SET ai_confidence = EXCLUDED.ai_confidence;

-- Audit: trigger automático
```

Não atualiza `questions.status` — classificação não muda o status. O status
só muda em revisão humana.

## Output do prompt — JSON estrito

```json
{
  "question_id": "uuid",
  "modulo": {"slug": "cardiovascular", "confidence": 92},
  "tipo_questao": {"slug": "conduta", "confidence": 87},
  "recurso_visual": {"slug": "ecg", "confidence": 95},
  "dificuldade": {"slug": "medio", "confidence": 80},
  "rationale": "Caso clínico com FA pós-operatória; pede conduta. ECG presente nas alternativas.",
  "warnings": []
}
```

## Métricas de qualidade

- `pct_classificadas_completamente` (4 dimensões em todas): target 100%
- `confidence_medio_por_dimensao`: target ≥ 80
- `taxa_revisao_humana`: target ≤ 15% (revisão = uma tag rejeitada por humano)

## Tracking de custo

Após cada chamada, registrar em `api_usage`:

```sql
INSERT INTO api_usage (provider, model, operation, exam_id, question_id,
                      input_tokens, output_tokens,
                      cache_creation_input_tokens, cache_read_input_tokens,
                      cost_usd)
VALUES ('anthropic', 'claude-sonnet-4-5', 'classify_question', ...);
```

## Recursos

- `resources/prompt_classificacao.md` — prompt versionável (com placeholders
  para a taxonomia completa)

## Anti-padrões

- ❌ Classificar questão `status='pending_extraction'` — alternativas podem
  estar incompletas
- ❌ Inventar slugs novos — use os 26 da taxonomia atual
- ❌ Atribuir 2 tags da mesma dimensão (ex: 2 módulos) — uma questão tem 1
  módulo principal só
- ❌ Pular `recurso_visual=sem_imagem` quando `has_images=false` — sempre
  marcar
- ❌ Esquecer `ai_confidence` — sem ela, revisão humana fica cega
- ❌ Concorrência alta sem rate limit — Anthropic API tem limites
