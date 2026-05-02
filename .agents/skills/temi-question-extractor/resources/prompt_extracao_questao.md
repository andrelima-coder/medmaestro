# Prompt — Extração de Questão (Estágio 2, com OCR companion)

Carregado em runtime por `stage2_vision.py` ou pela API Route. Edite aqui em
vez de hardcodar no código. Use `{num_questao}`, `{texto_ocr}` e
`{formato_caderno}` como placeholders Python `.format()`.

---

Você está extraindo uma questão da prova **AMIB TEMI** (formato {formato_caderno})
a partir da imagem da página de um caderno.

Sua tarefa: extrair a questão de número **{num_questao}** desta página,
devolvendo JSON estrito (sem comentários, sem markdown, apenas o objeto).

## Contexto OCR (incompleto, use só como referência)

```
{texto_ocr}
```

## Estrutura JSON de saída — devolva exatamente este formato

```json
{{
  "num_questao": {num_questao},
  "statement": "<enunciado completo, corrigindo erros de OCR>",

  "caso_clinico_compartilhado": {{
    "presente": false,
    "texto": null,
    "questoes_que_compartilham": []
  }},

  "has_image": true,
  "image_principal": {{
    "descricao_clinica": "<ex: 'curva de capnografia com platô descendente irregular'; null se não houver>",
    "image_type": "ecg|radiografia|tomografia|ultrassom|grafico_ventilador|curva_pv|tabela_laboratorial|grafico_estatistico|fotografia_clinica|esquema_anatomico|outro|null",
    "bbox_pct": [x1, y1, x2, y2]
  }},

  "alternative_a": {{"texto": "...", "eh_imagem": false, "bbox_pct": null}},
  "alternative_b": {{"texto": "...", "eh_imagem": false, "bbox_pct": null}},
  "alternative_c": {{"texto": "...", "eh_imagem": false, "bbox_pct": null}},
  "alternative_d": {{"texto": "...", "eh_imagem": false, "bbox_pct": null}},
  "alternative_e": null,

  "alternativas_sao_imagens": false,

  "tabelas_extras": "<reproduza tabelas em markdown se houver, ou null>",

  "anulada": false,
  "motivo_anulacao": null,

  "extraction_confidence": 0.0,
  "observacoes": "<se algo limitou a confiança, descreva — ex: 'OCR muito ruim, alternativas reconstruídas inteiramente da imagem'>"
}}
```

## Regras invariantes

1. **Não resumir** o enunciado. Reproduza-o integralmente.
2. **Não corrigir** erros de português ou pontuação do original — podem ser
   intencionais ou parte da pegadinha. Corrija apenas erros óbvios de OCR
   (caracteres trocados como "0/O", "1/l", espaços faltando).
3. **Preservar unidades e valores** exatos: `Hb 8,5 g/dL`, `PaCO2 35 mmHg`,
   `RASS -3` — nunca converter ou resumir.
4. **Manter ordem original** das alternativas. Nunca reordene
   alfabeticamente o conteúdo. A letra correta do gabarito depende disso.
5. **Bbox em percentual da imagem (0–100)**, formato
   `[x_topo_esq, y_topo_esq, x_baixo_dir, y_baixo_dir]`. Nunca em pixels.
6. **Alternativas que são imagens** (gráficos, ECGs, alças P-V, etc):
   preencha `eh_imagem: true`, `bbox_pct: [...]`, e em `texto` coloque uma
   descrição clínica concisa do que a imagem mostra (≤200 chars).
7. **Casos clínicos compartilhados**: TEMI 2020-2025 não usa este formato.
   Se aparecer "As questões X e Y referem-se ao caso a seguir", preencha o
   objeto `caso_clinico_compartilhado` com o texto integral.
8. **Anulada**: se o caderno indicar oficialmente, marque `anulada: true` e
   copie o motivo.
9. **extraction_confidence**: 1.0 = perfeita; 0.85+ = utilizável; <0.85 =
   sinalize problema em `observacoes`.

## Taxonomia de `image_type`

| Tipo | O que esperar |
|---|---|
| `ecg` | Eletrocardiograma — descreva FC, ritmo, eixo, alterações ST/T, derivações |
| `radiografia` | RX — incidência (PA/AP/perfil), região, achados, lateralidade |
| `tomografia` | TC — corte (axial/coronal/sagital), região, contraste, achados |
| `ultrassom` | USG/Doppler — modo, região, achados, lateralidade |
| `grafico_ventilador` | Curvas P×t, V×t, Fluxo×t, alças PV/VV |
| `curva_pv` | Alça pressão-volume isolada |
| `tabela_laboratorial` | Tabela com valores de exames |
| `grafico_estatistico` | Kaplan-Meier, ROC, distribuições, etc |
| `fotografia_clinica` | Foto de lesão, exame físico, dispositivo |
| `esquema_anatomico` | Diagrama com setas/marcações |
| `outro` | Não se encaixa nos anteriores — descreva detalhadamente |

## Multi-página

Se você está vendo múltiplas imagens (questão atravessa páginas), trate o
conjunto como uma questão única. Consolide enunciado + figuras + alternativas
em UM objeto JSON. **Não invente** alternativas não vistas.

## Anti-padrões

- ❌ Inventar alternativas não visíveis
- ❌ Truncar enunciado longo "para economizar tokens"
- ❌ Corrigir português que pode ser proposital
- ❌ Reordenar alternativas
- ❌ Misturar conteúdo de duas questões
- ❌ Devolver bbox em pixels absolutos
- ❌ Devolver markdown ao redor do JSON (sem ` ```json ` fences)
- ❌ Resolver a questão (esta tarefa é só extração — comentar e resolver são
  pipelines separados)
