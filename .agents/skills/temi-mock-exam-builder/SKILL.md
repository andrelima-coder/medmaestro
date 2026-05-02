---
name: temi-mock-exam-builder
description: Compõe simulados de medicina intensiva selecionando questões de questions com filtros JSONB, balanceamento por módulo (Pareto histórico) e dificuldade. Use quando o usuário pedir para montar simulado, criar prova nova, gerar mock exam, ou compor uma avaliação. Salva em simulados + simulado_questions.
---

# Skill — Montador de Simulados

Compõe simulados realistas a partir de `questions` (e opcionalmente
`question_variations` já promovidas).

## Quando ativar

- "monte um simulado de 90 questões"
- "crie uma prova nova com Pareto histórico"
- "preciso de um simulado focado em respiratório"
- "gere mock exam de questões difíceis"

## Schema-alvo

```sql
-- simulados (1 row por simulado)
{
  "id": "uuid",
  "title": "Simulado TEMI 2026 — Pareto",
  "created_by": "uuid_usuario",
  "filters_used": {
    "type": "pareto" | "modulo_focus" | "dificil_only" | "custom",
    "total_questions": 90,
    "modulos": ["cardiovascular", "respiratorio", ...],
    "dificuldades": ["medio", "dificil"],
    "exclude_published_after": null,
    "include_variations": true
  },
  "total_questions": 90,
  "export_path": null  // preenchido após exportação
}

-- simulado_questions (N rows, ordenadas por position)
{
  "simulado_id": "uuid",
  "question_id": "uuid",  // ⚠️ APONTA SÓ pra questions, não para variations
  "position": 1,           // unique (simulado_id, position)
  "note": null
}
```

⚠️ **Constraint importante:** `simulado_questions.question_id` aponta apenas
para `questions`. Variações precisam ser **promovidas** (via WF04) antes de
entrar em simulado. Ver `temi-question-generator` skill.

## Tipos de simulado

| Tipo | Total | Distribuição | Quando usar |
|---|---|---|---|
| `prova_completa` | 90 | Pareto histórico real | Simulado oficial pré-prova |
| `pareto_top5` | 60 | Apenas top 5 módulos do Pareto | Estudo focado |
| `revisao_modulo` | 20-30 | 100% de 1 módulo | Aprofundar 1 área |
| `dificil_only` | 30 | Só `dificuldade=dificil` | Treinar alfa-questões |
| `customizado` | N | Distribuição fornecida | Casos especiais |

## Distribuição Pareto sugerida (10 módulos)

Baseado em análise dos cadernos 2020-2025:

```typescript
export const PARETO_DISTRIBUTION_V1: Record<string, number> = {
  cardiovascular: 0.18,
  respiratorio: 0.21,
  infeccioso: 0.14,
  neurologico: 0.10,
  renal: 0.08,
  trauma_cirurgia: 0.07,
  gastro_nutricao: 0.06,
  hemato_onco: 0.05,
  medicina_perioperatoria: 0.06,
  etica_qualidade: 0.05,
};
// Total: 1.00. Ajuste conforme novos dados.
```

## Algoritmo de seleção (sem fn_build_mock_exam ainda)

Não existe a função `fn_build_mock_exam` no banco — será necessário fazer no
app. Pseudocódigo:

```typescript
async function buildMockExam(filters: SimuladoFilters) {
  const total = filters.total_questions;
  const distribution = filters.distribution || PARETO_DISTRIBUTION_V1;

  // Quotas por módulo
  const quotas = Object.fromEntries(
    Object.entries(distribution).map(([m, pct]) => [m, Math.round(total * pct)])
  );

  // Selecionar por módulo, balanceando dificuldade
  const selected = [];
  for (const [modulo, qty] of Object.entries(quotas)) {
    const candidates = await supabase
      .from('questions')
      .select('id, exam_id, question_number')
      .in('id', subqueryByTagSlug('modulo', modulo))
      .eq('status', 'published')
      .limit(qty * 3);  // 3× para ter pool

    // Aplicar balance de dificuldade (~20% facil, 60% medio, 20% dificil)
    const balanced = balanceByDifficulty(candidates, qty);
    selected.push(...balanced);
  }

  // Embaralhar e respeitar anti-clusters (não enfileirar 5 ECGs)
  return spreadByVisualResource(selected);
}
```

A query `subqueryByTagSlug` faz JOIN em `question_tags` + `tags` filtrando
por `dimension='modulo'` AND `slug='cardiovascular'`.

## Regras de composição

### Mix de origem
- **Prova oficial:** 70-80% questões originais, 20-30% variações já promovidas
- **Estudo:** 50/50 ou mesmo 30/70

### Balanceamento de dificuldade (em 90 questões)
- `facil`: 15-20%
- `medio`: 50-55%
- `dificil`: 25-30%

### Anti-clusters
- Não repetir mesmo `topico_edital` em mais de 4 questões em 90 (quando
  essa dimensão estiver populada)
- Não repetir mesma `source_question_id` (entre variações promovidas)
- Espaçar `recurso_visual=ecg` — não enfileirar 5 ECGs em sequência
- Não enfileirar 3+ questões `dificil` consecutivas (cansa o aluno)

## Como invocar

### API Route Next.js

```http
POST /api/simulados
{
  "title": "Simulado Pareto v1",
  "type": "prova_completa",
  "total_questions": 90,
  "include_variations": true,
  "exclude_question_ids": []
}
```

### SQL (analítico)

```sql
-- Verificar quantas questões published existem por módulo
SELECT t.slug AS modulo, COUNT(DISTINCT q.id) AS qtd
FROM questions q
JOIN question_tags qt ON qt.question_id = q.id
JOIN tags t ON t.id = qt.tag_id
WHERE t.dimension = 'modulo'
  AND q.status = 'published'
GROUP BY t.slug
ORDER BY qtd DESC;
```

## Persistência

```sql
BEGIN;

INSERT INTO simulados (title, created_by, filters_used, total_questions)
VALUES (...) RETURNING id;  -- $simulado_id

INSERT INTO simulado_questions (simulado_id, question_id, position)
SELECT $simulado_id, q.id, ROW_NUMBER() OVER ()
FROM ...;

COMMIT;
```

## Exportação

Após criação, o simulado pode ser exportado pela skill `temi-export`. O
campo `export_path` em `simulados` aponta para o arquivo no Storage.

## Anti-padrões

- ❌ Inserir `simulado_questions.question_id` apontando para uma row de
  `question_variations` — **viola FK**
- ❌ Selecionar com `random()` puro — perde balanceamento
- ❌ Incluir questão `has_images=true` sem verificar `status='published'`
- ❌ Misturar temas em proporção arbitrária sem usar Pareto
- ❌ Fazer simulado sem registrar `filters_used` — perde rastreabilidade
- ❌ Esquecer de registrar criação em `audit_logs`
