"""
Extrator TEMI — Estágio 2 (Vision).

Recebe o JSON do Estágio 1 e, para cada questão com precisa_vision=True,
chama Claude Vision com prompt estruturado e faz crop das imagens via bbox.

Saída por questão:
  - enunciado_limpo (texto corrigido pelo modelo)
  - alternativas: [{letra, texto, eh_imagem, bbox}]
  - imagens_anexas: [{descricao, bbox, tipo}]
  - confidence (0-1)
  - crops gerados em /home/claude/extrator/crops/
"""

import base64
import json
import os
from pathlib import Path

import anthropic
from PIL import Image


# Prompt calibrado para o domínio TEMI. Pede output JSON estrito.
PROMPT_EXTRACAO = """Você está extraindo uma questão de prova médica (AMIB TEMI) a partir da imagem da página de um caderno.

Sua tarefa: extrair a questão de número {num_questao} desta página, devolvendo JSON estrito (sem comentários, sem markdown, apenas o objeto).

CONTEXTO OCR (pode estar incompleto ou com erros, use só como referência):
---
{texto_ocr}
---

Devolva exatamente esta estrutura, em português:

{{
  "num_questao": {num_questao},
  "enunciado": "<texto completo do enunciado, corrigindo erros de OCR>",
  "tem_imagem_principal": true|false,
  "imagem_principal": {{
    "descricao": "<descrição clínica do que a imagem mostra: ex 'curva de capnografia com platô descendente irregular'; null se não houver>",
    "tipo": "ecg|tomografia|radiografia|ecocardiograma|ventilador|tabela|grafico|alca_pv|outro|null",
    "bbox_pct": [x1, y1, x2, y2]
  }},
  "alternativas": [
    {{"letra": "A", "texto": "...", "eh_imagem": false, "bbox_pct": null}},
    {{"letra": "B", "texto": "...", "eh_imagem": false, "bbox_pct": null}},
    ...
  ],
  "alternativas_sao_imagens": true|false,
  "tabelas_ou_dados_estruturados": "<reproduza tabelas em texto markdown, ou null>",
  "confidence": 0.0-1.0
}}

Regras:
- bbox_pct usa coordenadas em percentual da imagem (0-100), formato [x_topo_esq, y_topo_esq, x_baixo_dir, y_baixo_dir]
- Se uma alternativa for uma imagem (gráfico, ECG, etc), preencha bbox_pct e descreva clinicamente em "texto"
- Confidence 1.0 = extração perfeita; 0.7+ = utilizável; <0.7 = sinalize problema
- Se a questão se estende por múltiplas imagens (páginas), você verá todas e deve consolidar"""


def img_to_b64(path: str) -> str:
    return base64.standard_b64encode(open(path, 'rb').read()).decode('ascii')


def extrair_questao_via_vision(client, questao: dict, model: str = 'claude-sonnet-4-5') -> dict:
    """
    Envia a questão para Claude Vision e retorna estrutura JSON parseada.
    """
    content = [
        {'type': 'text', 'text': PROMPT_EXTRACAO.format(
            num_questao=questao['num'],
            texto_ocr=questao['texto_ocr'][:2000],
        )}
    ]
    # Anexa cada página JPEG da questão
    for img_path in questao['imagem_paths']:
        content.append({
            'type': 'image',
            'source': {
                'type': 'base64',
                'media_type': 'image/jpeg',
                'data': img_to_b64(img_path),
            }
        })

    resp = client.messages.create(
        model=model,
        max_tokens=2000,
        messages=[{'role': 'user', 'content': content}],
    )

    raw = resp.content[0].text.strip()
    # Limpa eventuais ```json ``` se aparecer
    if raw.startswith('```'):
        raw = raw.split('```')[1]
        if raw.startswith('json'):
            raw = raw[4:]
    return json.loads(raw)


def gerar_crops(questao: dict, extracao: dict, dest_dir: str) -> list[str]:
    """
    Faz crop das imagens com base nos bbox_pct retornados pelo Vision.
    Retorna lista de paths dos crops gerados.
    """
    Path(dest_dir).mkdir(parents=True, exist_ok=True)
    crops = []
    base_name = f"q_{questao['num']:03d}"

    # Crop da imagem principal (se houver)
    if extracao.get('tem_imagem_principal') and extracao.get('imagem_principal', {}).get('bbox_pct'):
        bbox = extracao['imagem_principal']['bbox_pct']
        # Usa primeira página como referência (multi-página exige lógica extra)
        src = questao['imagem_paths'][0]
        with Image.open(src) as im:
            w, h = im.size
            x1 = int(bbox[0] / 100 * w)
            y1 = int(bbox[1] / 100 * h)
            x2 = int(bbox[2] / 100 * w)
            y2 = int(bbox[3] / 100 * h)
            crop = im.crop((x1, y1, x2, y2))
            out = os.path.join(dest_dir, f"{base_name}_principal.jpeg")
            crop.save(out, quality=92)
            crops.append(out)

    # Crops das alternativas-imagem
    for alt in extracao.get('alternativas', []):
        if alt.get('eh_imagem') and alt.get('bbox_pct'):
            bbox = alt['bbox_pct']
            src = questao['imagem_paths'][0]
            with Image.open(src) as im:
                w, h = im.size
                x1 = int(bbox[0] / 100 * w)
                y1 = int(bbox[1] / 100 * h)
                x2 = int(bbox[2] / 100 * w)
                y2 = int(bbox[3] / 100 * h)
                crop = im.crop((x1, y1, x2, y2))
                out = os.path.join(dest_dir, f"{base_name}_alt_{alt['letra']}.jpeg")
                crop.save(out, quality=92)
                crops.append(out)

    return crops


# Exemplo de uso (apenas pseudocódigo de orquestração)
if __name__ == '__main__':
    # client = anthropic.Anthropic()  # ANTHROPIC_API_KEY do ambiente
    # questoes = json.load(open('temi_2024_questoes.json'))
    # for q in questoes:
    #     if not q['precisa_vision']:
    #         continue  # texto puro já está pronto
    #     extracao = extrair_questao_via_vision(client, q)
    #     crops = gerar_crops(q, extracao, '/home/claude/extrator/crops/2024')
    #     # Persistir no Supabase: questoes, alternativas, questao_imagens
    print('Estágio 2 — esqueleto pronto. Plugue ANTHROPIC_API_KEY e rode.')
