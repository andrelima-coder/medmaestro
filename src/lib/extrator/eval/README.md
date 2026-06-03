# Harness de QA do pipeline de extração (P0-3)

Mede a qualidade da extração contra um **golden set** verificado à mão, para que
toda mudança no extrator seja medida — não "achada". Cobre a fase **text-first**
de forma offline e gratuita (sem Supabase, sem Anthropic), que é onde está a
maior parte do conteúdo.

## Por que isso existe

O PRD define metas (≥85% de acurácia de extração, ≥75% de recorte de figura),
mas não havia nada medindo. Sem medição contínua, não dá para saber se um ajuste
de prompt/regex/código melhorou ou piorou o resultado. Este harness fecha esse
ciclo.

## Como montar um golden set

1. Escolha 1–2 provas inteiras (ex.: TEMI 2025 ROSA).
2. Reveja questão por questão **no PDF** e transcreva o gabarito-ouro num JSON
   seguindo `temi_2025_rosa.example.json`:
   - `stem`: enunciado exato.
   - `alternatives`: texto de cada alternativa (deixe de fora as que são imagem).
   - `expected_figures` / `expected_figure_types`: nº e tipos de figura por questão.
3. Salve como `golden/<slug>.json` (não use o sufixo `.example`).
4. Ajuste `pdf_path` (relativo ao diretório onde você roda, ou absoluto).

> A transcrição precisa de olhos clínicos — é a única etapa que não dá para
> automatizar. Vale o investimento: o golden set é reutilizável para sempre.

## Como rodar

```bash
cd app
npm i            # instala tsx (devDependency)
npm run eval:extract -- src/lib/extrator/eval/golden/temi_2025_rosa.json
# saída detalhada em JSON:
npm run eval:extract -- src/lib/extrator/eval/golden/temi_2025_rosa.json --json
```

## O que o relatório mostra

- **Encontradas (text-first):** % de questões do golden que o parser detectou.
- **Enunciado idêntico / ~igual (≥0.95):** fidelidade do stem (Levenshtein).
- **Alternativas corretas:** % de alternativas textuais batendo com o golden.
- **Cobertura text-first:** % aceitas sem IA (resto cairia na Vision).
- **Recall pista de figura:** dentre as questões com figura, % em que o parser
  detectou a pista visual (importante para não perder imagem).
- **Itens a revisar:** lista de questões com divergência, com flags.

## Escopo e próximos passos

- Coberto aqui (offline): text-first — stem, alternativas, roteamento p/ Vision,
  detecção de pista de figura.
- Ainda manual / rodada ao vivo: acurácia da Vision e qualidade do recorte/seleção
  de figura (recall/precisão de `question_images`). A estrutura de `types.ts` já
  prevê `expected_figures` para evoluir o harness nessa direção (ex.: comparar
  contra os `question_images` gravados após uma extração real em ambiente de teste).
