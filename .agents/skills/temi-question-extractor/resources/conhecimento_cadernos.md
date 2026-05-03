# Conhecimento dos Cadernos TEMI 2020-2025

> Referência técnica resultante da inspeção dos 7 cadernos disponíveis.
> Atualize este arquivo quando descobrir novos padrões ou novas anomalias.

## Estrutura dos arquivos `.pdf`

São **ZIPs renomeados**, não PDFs reais. Cada um contém:

```
<caderno>.pdf  (na verdade ZIP)
├── 1.jpeg               # imagem da página 1 (~1240×1754px)
├── 1.txt                # OCR companion da página 1
├── 2.jpeg
├── 2.txt
├── ...
└── manifest.json        # metadados de todas as páginas
```

### Estrutura do `manifest.json`

```json
{
  "num_pages": 48,
  "pages": [
    {
      "page_number": 1,
      "image": {
        "path": "1.jpeg",
        "dimensions": {"width": 924, "height": 1316},
        "media_type": "image/jpeg"
      },
      "text": {"path": "1.txt"},
      "has_visual_content": true,
      "page_uuid": "129b989f-..."
    },
    ...
  ]
}
```

**Use `has_visual_content` para decisões automáticas.** A flag está presente em
todos os cadernos e é razoavelmente confiável.

## Inventário dos 7 cadernos

| Caderno | Arquivo | Formato | OCR | Total Q | % Vision esperado |
|---|---|---|---|---|---|
| TEMI 2020 | `provatemi2020aazul.pdf` | B | Bom | 89 | ~37% |
| TEMI 2021 | `prova20211afasecomgabarito.pdf` | A | Degradado (sem letras) | 90 | ~100% |
| TEMI 2022 | `2022_1__Prova_TEMI.pdf` | A | Degradado (sem letras) | 90 | ~100% |
| TEMI 2023 | `prova20231afasecomgabaritoeanuladas_1.pdf` | B | Degradado (sem letras) | 87 | ~100% |
| TEMI 2024 | `2024_1__Prova_TEMI.pdf` | A | Bom | 90 | ~39% |
| TEMI 2025-rosa | `3fff41ccf74a4b1e93efa262216696da.pdf` | A | Bom | 90 | ~50% |
| PROVA_TEC 2025 | `PROVA_TEC_2025__TODAS_AS_QUESTO_ESGABARITO_docx.pdf` | VISION_ONLY | **Vazio** | 46 | 100% |

**Total: ~582 questões. Dessas, ~331 (57%) saem do OCR puro sem custo de Vision.**

## Os 4 formatos de marcação

### Formato A — TEMI 2021, 2024, 2025-rosa

```
QUESTÃO 08
<enunciado>
A. <texto da alternativa A>
B. <texto da alternativa B>
C. <texto da alternativa C>
D. <texto da alternativa D>
```

Regex de marcador: `^\s*QUEST[AÃÄ]O\s+(\d+)\b` (multiline, case-insensitive).
Regex de alternativa: `^\s*([A-E])[.)]\s+\S` (multiline).

### Formato B — TEMI 2020 e 2023

```
01. <enunciado começando com letra maiúscula>
a) <texto da alternativa a>
b) <texto da alternativa b>
c) <texto da alternativa c>
d) <texto da alternativa d>
```

Regex de marcador: `^\s*(\d{1,2})\.\s+[A-Z]` (multiline).
Regex de alternativa: `^\s*([a-e])\)\s+\S` (multiline).

### Formato C — TEMI 2022

```
Questão 5 (código 199)
<enunciado>
a. <texto da alternativa a>
b. <texto da alternativa b>
c. <texto da alternativa c>
d. <texto da alternativa d>
```

Regex de marcador: `(?:^|\s)Quest[aã]o\s+(\d+)|^\s*(\d{1,2})\.\s+[A-Z]` (multiline).
Regex de alternativa: `^\s*([a-e])\.\s+\S` (multiline).

### Formato VISION_ONLY — PROVA_TEC 2025

OCR completamente vazio (todos os `.txt` com 0 bytes). Detecta-se por:
amostra de texto dos primeiros 25 páginas tem zero matches de qualquer
formato A/B/C → cair em `VISION_ONLY`.

Modo de operação: cada página com `has_visual_content=true` vira uma "questão
candidata" e é enviada inteira ao Claude Vision. O modelo identifica o número
da questão olhando a imagem.

## Headers/footers detectados

A detecção é **estatística** (linhas que aparecem em >70% das páginas, nas
posições 1ª, 2ª e última, com normalização de números). Calibrado:

| Caderno | Headers típicos detectados |
|---|---|
| TEMI 2024 | `AMIB TEMI 2024`, `PROVA TEÓRICA - AMARELO #` |
| TEMI 2025-rosa | `AMIB TEMI 2025`, `PROVA TEÓRICA - ROSA #` |
| TEMI 2020 | `Prova para obtenção de Título de Especialista Medicina Intensiva – 2020 #` |
| TEMI 2022, 2023 | nenhum padrão consistente — extraídos sem header |

**Importante:** o filtro nunca remove linhas que contenham marcadores de
questão (`QUESTÃO`, `\d+\.`, etc) ou alternativas — proteção contra falso
positivo.

## Casos clínicos compartilhados

**TEMI 2020-2025 não usa.** Verificação em todos os 6 cadernos OCR-utilizáveis:
zero matches reais para padrões "questões X a Y referem-se" / "para responder
às questões X a Y" / "considere o caso a seguir para as questões X-Y".

A tabela `casos_clinicos` no schema existe defensivamente para suporte futuro,
mas o seed inicial fica vazio.

## Questões multi-página

Existem em todos os formatos. Detectar quando a questão atravessa páginas:
o algoritmo do Estágio 1 calcula o range usando os offsets globais dos
marcadores `QUESTÃO N` e `QUESTÃO N+1` no texto concatenado de todas as
páginas. A questão N ocupa `[pos(N), pos(N+1))`.

**Casos típicos de multi-página:**
- Q69/2025-rosa: enunciado na pg X, 4 ECGs como alternativas em pg X+1
- Q8/2024: enunciado e alternativas-gráfico ocupam pgs 5-6
- Casos clínicos longos com tabelas que se estendem entre páginas

## Alternativas que SÃO imagens

Padrão típico no OCR quando isto acontece:

```
QUESTÃO 08
<enunciado>
A
B D
C
```

Apenas as letras isoladas, sem texto após cada uma. O conteúdo gráfico
(curvas, ECGs, etc.) está perdido no OCR — só Vision recupera.

Detecção: ≥3 matches de letra solta (`^\s*[A-E]\s*$`) e <2 matches de
alternativa-com-texto.

## Confidence típica esperada

> Escala do banco: `extraction_confidence` smallint **0-100** (não float 0-1).
> Multiplique por 100 antes de inserir.

| Tipo de questão | Confidence média (0-100) |
|---|---|
| Texto puro sem imagem | 95-98 |
| Texto + tabela simples | 92-95 |
| Texto + gráfico simples (linha, barras) | 90-95 |
| Caso clínico com tabela hemodinâmica | 88-92 |
| Imagem de ECG/EEG | 82-88 |
| 4 ECGs como alternativas | 78-85 |
| Tomografia/Radiografia | 85-92 |

Confidence < 85 → marcar para revisão humana antes de publicar.

## Gabaritos disponíveis

| Caderno | Fonte do gabarito |
|---|---|
| TEMI 2020-2024 | Última página do PDF original (parsing por OCR) |
| TEMI 2025-rosa | Última página + comparação com PROVA_TEC docx |
| PROVA_TEC 2025 | `PROVA_TEC_2025_-_TODAS_AS_QUESTO_ES-GABARITO_docx.docx` (markdown table) |

## Limitações conhecidas

1. **Precisão de bbox**: o modelo retorna bboxes em % com IoU >0.9 em ~98% dos
   casos. Slip de ~2% — fica deslocado em alguns ECGs grandes. Validação
   visual recomendada antes de publicar.
2. **Detecção de "anulada"**: confiável apenas quando o caderno marca
   explicitamente. Anulações posteriores (após publicação) não estão nos PDFs.
3. **Caderno 2023**: tem questões anuladas marcadas no nome do arquivo
   ("comgabaritoeanuladas") — provavelmente inseridas manualmente como
   apêndice. Total de 87 questões parece ser real, não bug.
