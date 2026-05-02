---
name: temi-question-generator
description: Gera variações originais de questões TEMI/AMIB salvando em question_variations, com workflow de aprovação humana e promoção para questions reais (que aí podem entrar em simulado). Use quando o usuário pedir para criar variações de questão, gerar questões similares, expandir banco com IA, ou rodar WF04. Cada variação herda tags da questão-fonte como starting point.
---

# Skill — Gerador de Variações (WF04)

Cria questões inéditas estruturalmente equivalentes a uma semente. Workflow:
**gerar → revisar → aprovar → promover** para `questions` real.

## Quando ativar

- "gere variações da questão X"
- "crie 5 questões similares a esta"
- "rode o WF04"
- "expanda o banco com 50 questões novas de cardiovascular"

## Input requirements

A questão semente precisa ter:
- `status` ∈ {`approved`, `published`}
- Tags pelo menos em `modulo`, `tipo_questao`, `dificuldade`
- `correct_answer` validado (deve estar em `answer_keys`)

Sementes ainda não classificadas → **bloquear** e instruir o usuário a rodar
WF02/WF03 primeiro. A geração herda essas tags.

## Modelo

**Claude Sonnet** padrão. Geração estruturada responde bem ao Sonnet com
prompt caching.

## Schema-alvo

`question_variations`:

```json
{
  "source_question_id": "uuid",
  "stem": "<novo enunciado>",
  "alternatives": {"A": "...", "B": "...", "C": "...", "D": "..."},
  "correct_answer": "B",
  "rationale": "<explicação interna do gerador — por que essa é a correta>",
  "difficulty_delta": 0,    // -1 mais fácil, 0 igual, +1 mais difícil
  "ai_model": "claude-sonnet-4-5",
  "approved": false,        // gate humano obrigatório
  "approved_by": null,      // uuid do usuário ao aprovar
  "approved_at": null,
  "promoted_question_id": null  // preenchido após promoção
}
```

`question_variation_tags`: espelho de `question_tags` para a variação.
Geralmente herda as tags da semente; humanos podem ajustar pós-revisão.

## Workflow de promoção (importante!)

Variações **não entram em simulados** diretamente. O fluxo:

```
gerada (approved=false)
    │
    ├─ humano aprova → approved=true, approved_by, approved_at
    │
    └─ humano promove (botão "Promover") →
       ├─ INSERT em questions (com status='approved')
       ├─ INSERT em answer_keys (correct_answer da variação)
       ├─ INSERT em question_tags (espelho de question_variation_tags)
       └─ UPDATE question_variations.promoted_question_id = nova questions.id
```

A constraint `simulado_questions.question_id FK questions.id` força o
caminho da promoção — não dá pra "simular" usando variation_id.

## Como invocar

### Modo 1 — API Route Next.js

```http
POST /api/variations
{
  "seed_question_ids": ["uuid1", "uuid2"],
  "count_per_seed": 3,
  "concurrency": 2
}
```

### Modo 2 — Direto via SQL para 1 questão

```sql
-- Pegar a semente com tags
SELECT q.*, jsonb_agg(t.slug) FILTER (WHERE t.dimension = 'modulo') AS modulos,
       jsonb_agg(t.slug) FILTER (WHERE t.dimension = 'dificuldade') AS dificuldades
FROM questions q
LEFT JOIN question_tags qt ON qt.question_id = q.id
LEFT JOIN tags t ON t.id = qt.tag_id
WHERE q.id = $1
GROUP BY q.id;
```

## Output do prompt — JSON estrito (array)

```json
[
  {
    "stem": "<enunciado novo>",
    "alternatives": {"A":"...", "B":"...", "C":"...", "D":"..."},
    "correct_answer": "C",
    "rationale_correta": "<por que C é correta>",
    "rationale_distratores": "<por que A/B/D são erradas plausíveis>",
    "difficulty_delta": 0,
    "similarity_score": 0.78,
    "warnings": []
  }
]
```

## Regras de geração — invariantes

### MANTER (estruturalmente equivalente)
- Mesmo `modulo` da semente
- Mesma `dificuldade` (a menos que `difficulty_delta` seja explícito)
- Mesmo `tipo_questao` (mesmo tipo de habilidade testada)
- 4 alternativas (A-D), todas plausíveis

### VARIAR (caso novo)
- Demografia: idade, sexo, peso, etnia (quando relevante)
- Comorbidades: trocar HAS+DM por DPOC+IRC, por exemplo
- Apresentação clínica: sinais, sintomas, tempo de evolução
- Dados laboratoriais: valores diferentes mas coerentes
- Alternativas: redação nova, distratores diferentes
- Setting: UTI clínica, UTI cirúrgica, emergência

### NUNCA
- Copiar literalmente trechos do enunciado original
- Mudar o conceito sendo testado
- Criar alternativa-pegadinha óbvia (ex: dose 10× maior)
- Inventar dados laboratoriais incoerentes
- Usar a mesma cadência narrativa palavra-por-palavra

## Calibração de `similarity_score`

- **0.85-0.90**: estrutura idêntica, só dados/demografia mudam
- **0.70-0.85**: mesmo conceito, apresentação clínica diferente ← ideal
- **0.55-0.70**: tema próximo, ângulo diferente ← aceitável
- **<0.55**: divergiu do tema → **rejeitar antes de inserir**

Aceitar no banco apenas variações com `similarity_score` ∈ [0.65, 0.90].

## Métricas de qualidade

- `taxa_aprovacao_revisao`: target ≥ 60% (geração é mais difícil que
  classificação, esperar mais rejeição humana)
- `taxa_promocao` (das aprovadas): target ≥ 80%
- `pct_alternativas_plausiveis` (LLM-as-judge opcional): target ≥ 95%

## Recursos

- `resources/prompt_geracao.md` — prompt principal
- `resources/prompt_validacao.md` — LLM-as-judge para gate antes de inserir

## Anti-padrões

- ❌ Gerar a partir de questão sem classificação (`question_tags` vazias)
- ❌ Aceitar geração com `similarity_score > 0.90` (quase plagia a semente)
- ❌ Pular validação pós-geração (modelo é otimista demais sozinho)
- ❌ Marcar `approved=true` automaticamente — sempre revisão humana
- ❌ Inserir em `simulado_questions` antes de promover
- ❌ Promover sem espelhar tags da variação para `question_tags`
- ❌ Esquecer de registrar uso em `api_usage`
