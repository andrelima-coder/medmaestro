# Workflow — Pipeline Completo Pós-Extração

> Roteiro: do exam já extraído (Estágio 3 do WF01 pronto) até questões
> publicadas com classificação + comentários multi-tipo + revisão.
>
> Invoque dizendo: *"Rode o pipeline pós-extração para o exam X."*

## Pré-condições

- [ ] Exam tem questões com `status='pending_review'` ou superior
- [ ] Métricas do WF01 atingiram os gates (≥90% alts completas, ≥95% match gabarito)
- [ ] `question_images` populadas (com `full_page_path`, opcionalmente `cropped_path`)
- [ ] `answer_keys` populado (trigger `sync_correct_answers()` propagou)

## Etapas

### 1. Classificação curricular (WF02)

```http
POST /api/classify
{
  "exam_id": "<uuid>",
  "concurrency": 5,
  "dry_run": true
}
```

Worker pega questões com `status='pending_review'` ou superior **sem rows
em question_tags** e classifica via Claude Sonnet. Output: rows em
`question_tags` (1 por dimensão classificada).

**Gate pós-classificação:**

```sql
-- Distribuição por módulo
SELECT t.slug AS modulo, COUNT(DISTINCT q.id) AS qtd
FROM questions q
JOIN question_tags qt ON qt.question_id = q.id
JOIN tags t ON t.id = qt.tag_id
WHERE q.exam_id = $1 AND t.dimension = 'modulo'
GROUP BY t.slug
ORDER BY qtd DESC;
```

A distribuição deve ser razoavelmente próxima do Pareto histórico
(cardiovascular ~18%, respiratorio ~21%, etc). Módulo com 0 questões em
caderno completo é provável bug do classificador.

```sql
-- Confiança média
SELECT t.dimension, AVG(qt.ai_confidence) AS avg_conf
FROM question_tags qt
JOIN tags t ON t.id = qt.tag_id
JOIN questions q ON q.id = qt.question_id
WHERE q.exam_id = $1 AND qt.added_by_type = 'ai'
GROUP BY t.dimension;
```

Esperar `avg_conf >= 80` em todas as dimensões. Se uma dimensão tem
<70, sinalizar para revisão.

### 2. Comentários (WF03) — múltiplos por questão

A decisão de modo vem do campo `exams.auto_comments`:

| Modo | Geração |
|---|---|
| `none` | (não roda) |
| `simple` | Só `comment_type='explicacao'` em todas |
| `hybrid` | `explicacao` sempre + outros tipos quando aplicáveis (Opus para casos selecionados) |

```http
POST /api/comments
{ "exam_id": "<uuid>", "concurrency": 3 }
```

A rota lê `exams.auto_comments` e enfileira jobs.

Output: rows em `question_comments` com `status='draft'`.

**Importante:** uma questão pode receber 1 (`explicacao`) ou até 5 comentários
(`explicacao` + `pegadinha` + `mnemonico` + `referencia` + `atualizacao_conduta`).
**Não force criação dos 5** — só quando aplicável.

### 3. Revisão humana

⚠️ **Etapa obrigatória.** Comentários `status='draft'` não vão direto pra
publicação.

UI: `app/(dashboard)/comments?exam_id=X&status=draft` mostra lado a lado
questão + classificação + cada comentário gerado, com botões:
- ✅ **Aprovar** → `status='published'`, `reviewed_by` preenchido
- ✏️ **Editar e aprovar** → modifica `content`, depois `status='published'`
- ❌ **Rejeitar** → `status='rejected'` (ou DELETE) + nota; volta pra geração

### 4. Aprovar e publicar questões

Para questões que tem ≥1 comentário `published` E `extraction_confidence>=85`:

```sql
UPDATE questions
SET status = 'approved'
WHERE exam_id = $1
  AND status = 'pending_approval'
  AND extraction_confidence >= 85
  AND id IN (
    SELECT DISTINCT question_id FROM question_comments
    WHERE comment_type = 'explicacao' AND status = 'published'
  );

-- Após validação editorial final:
UPDATE questions
SET status = 'published'
WHERE exam_id = $1 AND status = 'approved';
```

### 5. (Opcional) Gerar variações dos top temas (WF04)

Para os 5-10 temas mais relevantes do Pareto, gerar 3-5 variações cada:

```http
POST /api/variations
{
  "seed_question_ids": ["<id1>", "<id2>", ...],
  "count_per_seed": 3,
  "concurrency": 2
}
```

Variações entram em `question_variations` com `approved=false`. Devem
passar revisão humana **e** ser **promovidas** (gera row em `questions`)
antes de entrar em simulado. Ver skill `temi-question-generator`.

### 6. (Opcional) Gerar flashcards das questões aprovadas

Para temas-chave, gerar flashcards SRS:

```http
POST /api/flashcards
{ "source_question_ids": [...] }
```

Output em `flashcards` com `approved=false` (gate humano).

## Custo estimado por exam de 90 questões

| Fase | Modelo | Tokens (com cache) | Custo |
|---|---|---|---|
| WF02 (classificação) | Sonnet | ~10k input cached + ~500 output × 90 | ~$0.40 |
| WF03 modo `hybrid` | Sonnet × ~75 + Opus × ~15 | ~80k tokens | ~$3-4 |
| WF04 (3 vars × 10 sementes) | Sonnet × 30 | ~$1.50 |
| Flashcards (opcional, 30 cards) | Sonnet | ~$0.30 |
| **Total estimado** | | | **~$5-6 por caderno** |

Tracking via `api_usage` (cada chamada registra cost_usd com cache hits).

## Anti-padrões

- ❌ Pular WF02 e ir direto pro WF03 — comentário fica genérico sem
  classificação. Skill commenter rejeita questões sem `question_tags` mínimas.
- ❌ Publicar questão `extraction_confidence < 85` sem revisão humana
- ❌ Rodar WF04 antes de ter questões `status='published'` — geração precisa
  de sementes validadas
- ❌ Forçar criação dos 5 tipos de comentário sempre — só quando aplicável
- ❌ Inserir variações em simulado sem promover (viola FK)
