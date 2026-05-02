# Prompt — Extração Vision-Only (PROVA_TEC 2025)

Para cadernos sem OCR companion. Roda 1 página por chamada e o modelo
identifica todas as questões presentes na página.

Use `{num_pagina}` como placeholder.

---

Você está extraindo questões da prova **PROVA_TEC 2025** (AMIB) a partir
da imagem da página **{num_pagina}**.

Não há texto OCR disponível — toda a extração depende do que você consegue
ler diretamente da imagem.

## Estrutura JSON de saída

Devolva um array com TODAS as questões presentes na página (uma página pode
conter 1, 2 ou mais questões):

```json
{{
  "page_number": {num_pagina},
  "questions": [
    {{
      "num_questao": <inteiro>,
      "statement": "<enunciado completo>",

      "has_image": true,
      "image_principal": {{
        "descricao_clinica": "...",
        "image_type": "ecg|radiografia|tomografia|...|null",
        "bbox_pct": [x1, y1, x2, y2]
      }},

      "alternative_a": {{"texto": "...", "eh_imagem": false, "bbox_pct": null}},
      "alternative_b": {{"texto": "...", "eh_imagem": false, "bbox_pct": null}},
      "alternative_c": {{"texto": "...", "eh_imagem": false, "bbox_pct": null}},
      "alternative_d": {{"texto": "...", "eh_imagem": false, "bbox_pct": null}},
      "alternative_e": null,

      "alternativas_sao_imagens": false,
      "is_complete": true,
      "continues_on_next_page": false,

      "anulada": false,
      "extraction_confidence": 0.0,
      "observacoes": "<...>"
    }},
    ...
  ]
}}
```

## Regras

Aplicam-se as mesmas regras invariantes do prompt principal
(`prompt_extracao_questao.md`), com 2 adições específicas para Vision-Only:

10. **`is_complete: false`** se a questão começa nesta página mas as
    alternativas estão truncadas (continua na próxima).
11. **`continues_on_next_page: true`** quando aplicável — o orquestrador
    junta as duas páginas e re-processa como questão única.

## Estratégia de leitura

1. Identifique todos os marcadores de questão na página (geralmente
   "QUESTÃO N" em destaque visual).
2. Para cada um, leia o enunciado completo. Atenção a tabelas e dados
   laboratoriais — copie valores exatos.
3. Identifique imagens (ECG, TC, RX, gráficos, fotos) e classifique pelo
   image_type. Forneça bbox em percentual.
4. Se as alternativas A, B, C, D são gráficos/imagens (não texto), marque
   `alternativas_sao_imagens: true`, preencha bbox de cada uma e descreva
   clinicamente em `texto`.
5. Atribua extraction_confidence honesto: 0.95+ se foi fácil ler tudo,
   0.80-0.90 se há ECG/EEG complexo onde algumas marcações são incertas.

## Anti-padrões adicionais

- ❌ Atribuir números de questão em ordem sequencial se você não tem certeza
  — leia o número exato impresso na página.
- ❌ Concatenar páginas mentalmente — sempre processe **uma página por chamada**.
  O orquestrador faz a junção depois.
- ❌ Inventar dados laboratoriais "que devem ter ali" — se a tabela está
  cortada, marque `is_complete: false`.
