---
name: temi-export
description: Exporta questões e simulados do banco TEMI para PDF e DOCX para distribuição offline aos alunos. Use quando o usuário pedir para exportar questões, gerar PDF/Word, criar caderno de simulado para impressão, ou enviar prova para alunos. Suporta filtros combinados (módulo via tags, ano via exam, dificuldade) e modos com/sem gabarito.
---

# Skill — Exportação de Questões/Simulados

Gera PDF ou DOCX a partir de queries no banco. Saída pode incluir gabarito,
comentários ou apenas as questões.

## Quando ativar

- "exporte as questões do módulo cardiovascular em PDF"
- "gere PDF do simulado X"
- "preciso enviar a prova de revisão pros alunos em Word"
- "exporta com gabarito e comentários"

## Modos de exportação

| Modo | Conteúdo | Arquivo |
|---|---|---|
| `prova_branca` | Só `stem` + `alternatives` | PDF/DOCX para responder |
| `prova_com_gabarito` | + página final com gabarito (de `answer_keys`) | PDF/DOCX padrão |
| `prova_com_comentarios` | + comentários `published` agrupados por tipo | PDF/DOCX revisão |
| `lista_estudo` | Questão + comentário `explicacao` direto após ela | PDF/DOCX estudo |
| `csv_revisao` | CSV pra importação em outras ferramentas | CSV |

## Filtros disponíveis

```typescript
type ExportFilters = {
  // Por origem
  exam_ids?: string[];                  // 1+ exams específicos
  years?: number[];                     // ex: [2024, 2025]

  // Por classificação (via tags)
  modulos?: string[];                   // slugs: ['cardiovascular', 'respiratorio']
  tipos_questao?: string[];             // slugs
  dificuldades?: ('facil'|'medio'|'dificil')[];
  recursos_visuais?: string[];

  // Por estado
  statuses?: QuestionStatus[];          // default: ['published']
  has_images?: boolean;

  // Por origem semântica
  origin?: 'original' | 'gerada' | 'todas';
  // 'original' = só questions originais (não promovidas de variations)
  // 'gerada'   = só questions com promoted_question_id pointing back

  // Para simulado
  simulado_id?: string;                 // exporta um simulado específico

  // Random subset
  random_subset?: number;               // ex: 30 (aleatórios do filtro)
};
```

## Query base

```sql
SELECT
  q.id,
  q.question_number,
  q.stem, q.stem_html,
  q.alternatives, q.alternatives_html,
  q.has_images,
  ak.correct_answer,
  e.year, e.booklet_color,
  -- Tags agrupadas por dimensão
  jsonb_object_agg(t.dimension, t.slug) FILTER (WHERE t.id IS NOT NULL) AS tags,
  -- Imagens
  (SELECT jsonb_agg(jsonb_build_object(
            'scope', qi.image_scope,
            'figure_number', qi.figure_number,
            'path', CASE WHEN qi.use_cropped THEN qi.cropped_path
                         ELSE qi.full_page_path END,
            'description', qi.ai_description))
   FROM question_images qi WHERE qi.question_id = q.id) AS images,
  -- Comentários publicados
  (SELECT jsonb_agg(jsonb_build_object(
            'type', qc.comment_type,
            'content', qc.content,
            'source', qc.source))
   FROM question_comments qc
   WHERE qc.question_id = q.id AND qc.status = 'published') AS comments
FROM questions q
JOIN exams e ON e.id = q.exam_id
LEFT JOIN answer_keys ak
  ON ak.exam_id = q.exam_id AND ak.question_number = q.question_number
LEFT JOIN question_tags qt ON qt.question_id = q.id
LEFT JOIN tags t ON t.id = qt.tag_id
WHERE q.status = 'published'
  -- ... filtros adicionais ...
GROUP BY q.id, e.id, ak.correct_answer
ORDER BY e.year, q.question_number;
```

## Regras de layout (PDF/DOCX)

### Cabeçalho
- Logo MedMaestro (gold `#C9A84C`)
- Título do simulado/lote
- Data de geração
- Disclaimer: "Uso interno — não distribuir publicamente"

### Por questão
1. Número (Syne 14pt bold)
2. Tags em pequeno: módulo, dificuldade, ano (DM Sans 9pt muted)
3. `stem_html` renderizado (12pt, justificado)
4. Imagem se `has_images=true` (centralizada, max 80% da largura útil) —
   usar `cropped_path` se `use_cropped=true`, senão `full_page_path`
5. Alternativas A) B) C) D) — usar `alternatives_html` se disponível
6. Espaço pra resposta OU gabarito ao lado, conforme modo

### Gabarito (modos `_com_gabarito` e `_com_comentarios`)
- Tabela 3 colunas: número | resposta | módulo

### Comentários (modo `_com_comentarios`)
- Após cada questão, bloco "Resolução:"
- Mostrar primeiro `explicacao`, depois `pegadinha`/`mnemonico`/`referencia`
  se existirem
- `atualizacao_conduta` em destaque amarelo (alerta)

## Stack técnica

- **PDF**: `puppeteer` server-side renderizando HTML com Tailwind, depois
  `puppeteer.pdf()`. Fonte Syne+DM Sans embedded.
- **DOCX**: lib `docx` (npm) montando `Document` programaticamente.
- **CSV**: `papaparse` com UTF-8 BOM (Excel-compatível).
- **Imagens**: baixar de Supabase Storage com `signedUrl` (bucket é privado),
  embeddar como base64 no HTML (PDF) ou referência em `Media.addImage` (DOCX).

## Persistência (audit + tracking)

Toda exportação registra:

```sql
-- audit_log via trigger automático ou manual:
INSERT INTO audit_logs (entity_type, entity_id, action_type, ...) VALUES (...);

-- Se for simulado: atualiza export_path
UPDATE simulados SET export_path = $storage_path WHERE id = $simulado_id;
```

Útil para rastrear vazamentos: quem exportou e quando.

## Recursos

- `resources/template_pdf.html` — template HTML com Tailwind para Puppeteer
- `resources/template_docx.ts` — função TypeScript para `Document` da `docx`

## Anti-padrões

- ❌ Exportar com `status != 'published'` sem aprovação explícita do admin
- ❌ Incluir comentários em PDF "prova_branca" (vaza gabarito por dedução)
- ❌ Esquecer disclaimer "uso interno"
- ❌ Embedar imagens grandes (>500KB) sem comprimir — PDF de 50MB é inviável
- ❌ Pular registro em audit_logs
- ❌ Exportar `cropped_path` quando `use_cropped=false` (mostre `full_page_path`)
