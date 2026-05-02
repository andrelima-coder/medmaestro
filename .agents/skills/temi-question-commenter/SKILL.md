---
name: temi-question-commenter
description: Gera comentários editoriais educativos para questões TEMI/AMIB usando os 5 tipos do enum comment_type (explicacao, pegadinha, referencia, mnemonico, atualizacao_conduta). Use quando o usuário pedir para gerar comentários, explicar questões com IA, rodar o WF03, ou comentar um exam. Cada questão pode receber múltiplos comments de tipos diferentes — modelo bem mais educacional que "1 comentário por questão".
---

# Skill — Comentarista Editorial (WF03)

Gera múltiplos comentários por questão, cada um com tipo específico
(explicação, pegadinha, referência, mnemônico, atualização de conduta).

## Quando ativar

- "gere comentários para o exam X"
- "rode o WF03"
- "explique as questões com IA"
- "comente essa questão" (1-shot)
- "porque a resposta é Y nessa questão?"

## Diferença chave do modelo antigo

**Não existe mais "um comentário compilado por questão".** O schema real
permite N comentários por questão, cada um especializado:

| `comment_type` | Quando emitir |
|---|---|
| `explicacao` | **Sempre** — comentário principal do raciocínio (1 por questão) |
| `pegadinha` | Quando o tema tem armadilha de prova clássica |
| `mnemonico` | Quando há mnemônico útil consolidado (BERLIM, ABCDE, etc.) |
| `referencia` | Quando há diretriz/trial seminal a citar |
| `atualizacao_conduta` | Quando guideline mudou recentemente e a "resposta antiga" pode ainda estar em livros |

Padrão: `explicacao` é obrigatório, os outros são opcionais e gerados só se
genuinamente aplicáveis. **Nunca forçar criação dos 5 tipos.**

## Input requirements

Questão precisa estar com `status` ∈ {`pending_approval`, `approved`} **E**
ter pelo menos `dimension='modulo'` em `question_tags` (precisa estar
classificada). Sem classificação, comentário fica genérico.

## Modos (alinhado ao campo `exams.auto_comments`)

| Modo (`auto_comments`) | Modelo | Tipos gerados |
|---|---|---|
| `none` | (não roda) | — |
| `simple` | Sonnet | só `explicacao` |
| `hybrid` | Sonnet (+ Opus em casos selecionados) | `explicacao` sempre + outros se aplicável |

Decisão automática "Opus em quais casos" (modo `hybrid`):
- Questão tem `tag dificil` OU `tag muito_dificil`
- `has_images=true` (visão complexa pede mais raciocínio)
- Tema é `cardiovascular`+`hemodinamica` ou `respiratorio`+`vmi` (alta densidade de armadilhas)

## Schema-alvo

Cada comentário gera 1 row em `question_comments`:

```json
{
  "question_id": "uuid",
  "comment_type": "explicacao | pegadinha | referencia | mnemonico | atualizacao_conduta",
  "content": "<texto markdown — pode ter quebras de linha e formatação>",
  "source": "<referência citada, ex: 'Surviving Sepsis 2021'>",
  "created_by_ai": true,
  "ai_model": "claude-sonnet-4-5 | claude-opus-4-x",
  "status": "draft"   // 'draft' até revisão; 'published' após
}
```

## Como invocar

### Modo 1 — API Route Next.js

```http
POST /api/comments
{ "exam_id": "uuid", "auto_mode": true, "concurrency": 3 }
```

A rota olha `exams.auto_comments` para decidir o modo, enfileira jobs e o
worker processa via `claim_jobs()`.

### Modo 2 — SQL para uma questão específica

```sql
SELECT q.id, q.stem, q.alternatives, q.correct_answer,
       (SELECT slug FROM tags t JOIN question_tags qt ON qt.tag_id = t.id
        WHERE qt.question_id = q.id AND t.dimension = 'modulo' LIMIT 1) AS modulo,
       (SELECT slug FROM tags t JOIN question_tags qt ON qt.tag_id = t.id
        WHERE qt.question_id = q.id AND t.dimension = 'dificuldade' LIMIT 1) AS dificuldade
FROM questions q
WHERE q.id = $1;
```

## Persistência

```sql
-- Cada tipo de comentário vira uma row separada
INSERT INTO question_comments (
  question_id, comment_type, content, source,
  created_by_ai, ai_model, status
) VALUES (...);

-- audit_logs: trigger automático
-- api_usage: registrar tokens e custo
```

**Status flow:**
1. IA gera → `status='draft'`
2. Professor/admin revisa → edita ou aprova → `status='published'` + `reviewed_by` preenchido
3. Se rejeitar → `status='rejected'` (ou DELETE)

## Tom editorial — invariante

- Didático, objetivo, direto. Sem floreios.
- Sem condescendência. Aluno é médico com 3+ anos de prática.
- "Dicas de prova" só se tema tem armadilha **documentada**, não inventar.
- Citar guideline com ano (ex: `"Surviving Sepsis 2021"`, `"ACC/AHA 2025"`)
  apenas se tem certeza. Senão, "diretrizes atuais".
- Português brasileiro. Termos consagrados em inglês ficam (PEEP, driving
  pressure, fluid responsiveness, ECMO, weaning).

## Recursos

- `resources/prompt_comentario_explicacao.md` — prompt do tipo `explicacao`
- `resources/prompt_comentario_pegadinha.md` — quando emitir, como redigir
- `resources/prompt_comentario_mnemonico.md`
- `resources/prompt_comentario_referencia.md`
- `resources/prompt_comentario_atualizacao.md`

## Anti-padrões

- ❌ Forçar criação dos 5 tipos sempre — só quando aplicável
- ❌ Repetir conteúdo entre tipos (mnemônico ≠ explicação resumida)
- ❌ Citar referência sem ano ou inventar trial
- ❌ Comentar sem ter classificação da questão (vira genérico)
- ❌ Marcar `status='published'` sem revisão humana
- ❌ Esquecer registro em `api_usage`
- ❌ Linguagem condescendente ("é fácil", "obviamente")
