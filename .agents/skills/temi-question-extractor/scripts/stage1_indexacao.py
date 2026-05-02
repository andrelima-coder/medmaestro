"""
Extrator TEMI v3 — incorpora 3 melhorias críticas vs v2:

1. Filtro estatístico de header/footer (linhas em >70% das páginas são removidas)
2. Detector de caso clínico compartilhado ("questões X a Y referem-se ao caso")
3. Validação automática contra gabarito (.docx markdown ou texto)

Mantém auto-detecção de formato A/B/C/VISION_ONLY da v2.
"""

import json
import os
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Optional


# ---------- Padrões por formato (idem v2) ----------
PATTERNS = {
    'A': {
        'questao': re.compile(r'^\s*QUEST[AÃÄ]O\s+(\d+)\b', re.IGNORECASE | re.MULTILINE),
        'alt_texto': re.compile(r'^\s*([A-E])[.)]\s+\S', re.MULTILINE),
        'alt_solta': re.compile(r'^\s*([A-E])\s*$', re.MULTILINE),
    },
    'B': {
        'questao': re.compile(r'^\s*(\d{1,2})\.\s+[A-Z]', re.MULTILINE),
        'alt_texto': re.compile(r'^\s*([a-e])\)\s+\S', re.MULTILINE),
        'alt_solta': re.compile(r'^\s*([a-e])\)?\s*$', re.MULTILINE),
    },
    'C': {
        'questao': re.compile(r'(?:^|\s)Quest[aã]o\s+(\d+)|^\s*(\d{1,2})\.\s+[A-Z]', re.MULTILINE),
        'alt_texto': re.compile(r'^\s*([a-e])\.\s+\S', re.MULTILINE),
        'alt_solta': re.compile(r'^\s*([a-e])\.\s*[A-Z]?[a-z]?$', re.MULTILINE),
    },
}

RE_REFERENCIAS_VISUAIS = re.compile(
    r'(?:a (?:imagem|figura|tabela|tomografia|radiografia|ecocardiograma|ECG|'
    r'eletrocardiograma|gr[áa]fico|al[çc]a|curva|monitor)|que se segue|'
    r'que se seguem|abaixo|a seguir|conforme (?:a )?figura|conforme abaixo|'
    r'representad[ao]|exames? abaixo|condi[çc][aã]o [A-D])',
    re.IGNORECASE,
)

# ---------- NOVO: detector de caso clínico compartilhado ----------
# Captura padrões como:
#   "As questões 12 e 13 referem-se ao caso a seguir"
#   "Considere o enunciado abaixo para responder às questões 45 a 48"
#   "Para as questões 30 a 33"
RE_CASO_COMPARTILHADO = re.compile(
    r'(?:'
    r'as quest[oõ]es\s+(\d+)\s+(?:e|a)\s+(\d+)'
    r'|para\s+(?:as\s+)?quest[oõ]es\s+(\d+)\s+(?:e|a|at[ée])\s+(\d+)'
    r'|responder\s+(?:[àa]s?\s+)?quest[oõ]es\s+(\d+)\s+(?:e|a|at[ée])\s+(\d+)'
    r'|quest[oõ]es?\s+(\d+)\s*(?:a|at[ée]|-)\s*(\d+)\s+(?:referem|com\s+base)'
    r')',
    re.IGNORECASE,
)


# ---------- Filtro estatístico de header/footer ----------
# Nunca-remover: linhas que parecem marcador de questão ou alternativa
RE_NAO_REMOVER = re.compile(
    r'(?:QUEST[AÃÄ]O|^\s*\d+\.\s*[A-Za-z]|^\s*[a-eA-E][.)]\s+\S)',
    re.IGNORECASE,
)


def detectar_headers_footers(textos: dict[int, str], threshold: float = 0.7) -> set[str]:
    """
    Linhas que aparecem em >threshold das páginas, SOMENTE nas posições
    típicas de header/footer (1ª-2ª linha do topo, última linha do rodapé).
    Linhas com marcador de questão/alternativa são imunes.
    """
    contador = Counter()
    paginas_validas = [t for t in textos.values() if t.strip()]
    if len(paginas_validas) < 3:
        return set()

    for txt in paginas_validas:
        linhas = [l.strip() for l in txt.split('\n') if l.strip()]
        # SÓ as 2 primeiras + a última (não 3+2 como antes)
        candidatas = linhas[:2] + linhas[-1:]
        for l in candidatas:
            if RE_NAO_REMOVER.search(l):
                continue  # imune
            chave = re.sub(r'\d+', '#', l).strip()
            if 8 <= len(chave) <= 80:
                contador[chave] += 1

    threshold_count = int(len(paginas_validas) * threshold)
    return {chave for chave, c in contador.items() if c >= threshold_count}


def remover_headers_footers(texto: str, padroes: set[str]) -> str:
    if not padroes:
        return texto
    linhas_filtradas = []
    for linha in texto.split('\n'):
        if RE_NAO_REMOVER.search(linha):
            linhas_filtradas.append(linha)
            continue
        chave = re.sub(r'\d+', '#', linha.strip())
        if chave not in padroes:
            linhas_filtradas.append(linha)
    return '\n'.join(linhas_filtradas)


# ---------- Detector de casos compartilhados ----------
def detectar_casos_compartilhados(textos: dict[int, str]) -> list[dict]:
    """
    Varre o texto procurando por anúncios de caso clínico compartilhado.
    Retorna lista de {pg, q_inicio, q_fim, texto_anuncio}.
    """
    casos = []
    for pg in sorted(textos.keys()):
        for m in RE_CASO_COMPARTILHADO.finditer(textos[pg]):
            grupos = [int(g) for g in m.groups() if g]
            if len(grupos) >= 2:
                qi, qf = sorted(grupos[:2])
                if 1 <= qi < qf <= 200 and qf - qi <= 10:  # sanidade
                    casos.append({
                        'pg_anuncio': pg,
                        'q_inicio': qi,
                        'q_fim': qf,
                        'snippet': m.group(0),
                    })
    return casos


# ---------- Parser de gabarito (markdown table) ----------
def parsear_gabarito_markdown(path: str) -> dict[int, str]:
    """
    Extrai gabarito de tabela markdown como:
      | **QUESTÃO** | **GABARITO** |
      | --- | --- |
      | **1** | **B** |
    Retorna {num_questao: letra}.
    """
    if not os.path.exists(path):
        return {}
    try:
        conteudo = open(path, encoding='utf-8').read()
    except UnicodeDecodeError:
        conteudo = open(path, encoding='latin-1').read()

    gabarito = {}
    # Match linhas tipo "| **1** | **B** |"
    for m in re.finditer(r'\|\s*\*?\*?(\d+)\*?\*?\s*\|\s*\*?\*?([A-E])\*?\*?\s*\|', conteudo):
        gabarito[int(m.group(1))] = m.group(2)
    return gabarito


# ---------- Pipeline principal ----------
def detectar_formato(textos: dict[int, str]) -> str:
    amostra = ''
    for pn in sorted(textos.keys())[:25]:
        if textos[pn].strip():
            amostra += textos[pn] + '\n'
        if len(amostra) > 5000:
            break
    if not amostra.strip():
        return 'VISION_ONLY'
    scores = {fmt: len(p['questao'].findall(amostra)) for fmt, p in PATTERNS.items()}
    melhor = max(scores, key=scores.get)
    return melhor if scores[melhor] >= 3 else 'VISION_ONLY'


def extrair_zip(zip_path: str, dest_dir: str) -> dict:
    Path(dest_dir).mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dest_dir)
    with open(os.path.join(dest_dir, 'manifest.json'), encoding='utf-8') as f:
        return json.load(f)


def parse_num_questao(match: re.Match) -> int:
    for g in match.groups():
        if g and g.isdigit():
            return int(g)
    return -1


def indexar_caderno(zip_path: str, work_dir: str,
                    gabarito_path: Optional[str] = None) -> dict:
    """Retorna dict com questões + casos compartilhados + gabarito + métricas."""
    manifest = extrair_zip(zip_path, work_dir)
    pages = sorted(manifest['pages'], key=lambda p: p['page_number'])

    page_data = {}
    textos = {}
    for p in pages:
        pn = p['page_number']
        try:
            txt = open(os.path.join(work_dir, p['text']['path']),
                       encoding='utf-8', errors='ignore').read()
        except FileNotFoundError:
            txt = ''
        page_data[pn] = {
            'jpeg': os.path.join(work_dir, p['image']['path']),
            'has_visual': p.get('has_visual_content', False),
        }
        textos[pn] = txt

    # NOVO: filtra headers/footers
    padroes_header = detectar_headers_footers(textos)
    textos_limpos = {pn: remover_headers_footers(t, padroes_header)
                     for pn, t in textos.items()}

    # NOVO: detecta casos compartilhados
    casos = detectar_casos_compartilhados(textos_limpos)
    questao_para_caso: dict[int, int] = {}
    for i, c in enumerate(casos):
        for q in range(c['q_inicio'], c['q_fim'] + 1):
            questao_para_caso[q] = i

    # NOVO: parseia gabarito se disponível
    gabarito = parsear_gabarito_markdown(gabarito_path) if gabarito_path else {}

    # Detecção de formato sobre texto JÁ LIMPO de headers
    formato = detectar_formato(textos_limpos)

    if formato == 'VISION_ONLY':
        questoes = []
        for pn in sorted(page_data.keys()):
            if page_data[pn]['has_visual']:
                questoes.append({
                    'num': pn,
                    'paginas': [pn],
                    'texto_ocr': '',
                    'formato': 'VISION_ONLY',
                    'caso_compartilhado_id': None,
                    'gabarito_oficial': gabarito.get(pn),
                    'tem_visual_na_pagina': True,
                    'tem_referencia_textual': False,
                    'alternativas_visuais': True,
                    'precisa_vision': True,
                    'motivo_vision': 'OCR ausente',
                    'imagem_paths': [page_data[pn]['jpeg']],
                })
        return {
            'formato': formato,
            'headers_removidos': sorted(padroes_header),
            'casos_compartilhados': casos,
            'gabarito_disponivel': len(gabarito) > 0,
            'questoes': questoes,
        }

    pats = PATTERNS[formato]
    questao_paginas: dict[int, list[int]] = defaultdict(list)
    for pn in sorted(page_data.keys()):
        for m in pats['questao'].finditer(textos_limpos[pn]):
            q = parse_num_questao(m) if formato == 'C' else int(m.group(1))
            if 1 <= q <= 200:
                questao_paginas[q].append(pn)

    if not questao_paginas:
        return {'formato': formato, 'questoes': [], 'erro': 'nenhuma questão detectada'}

    nums = sorted(questao_paginas.keys())
    questoes = []

    # Mapa do texto concatenado de todas as páginas, com offsets para localizar
    # cada marcador de questão de forma absoluta
    paginas_ord = sorted(textos_limpos.keys())
    texto_global = ''
    offset_pg: dict[int, int] = {}
    for pn in paginas_ord:
        offset_pg[pn] = len(texto_global)
        texto_global += textos_limpos[pn] + '\n\n'

    # Acha a posição (offset global) de cada início de questão
    pos_questao: dict[int, int] = {}
    for m in pats['questao'].finditer(texto_global):
        q = parse_num_questao(m) if formato == 'C' else int(m.group(1))
        if 1 <= q <= 200 and q not in pos_questao:  # primeira ocorrência ganha
            pos_questao[q] = m.start()

    def offset_para_pg(off: int) -> int:
        """Converte offset global em número de página."""
        ultima = paginas_ord[0]
        for pn in paginas_ord:
            if offset_pg[pn] <= off:
                ultima = pn
            else:
                break
        return ultima

    for i, q in enumerate(nums):
        if q not in pos_questao:
            continue
        start = pos_questao[q]
        # Próximo marcador (de qualquer questão > q) define o fim
        prox_starts = [pos_questao[n] for n in nums if n > q and n in pos_questao
                       and pos_questao[n] > start]
        end = min(prox_starts) if prox_starts else len(texto_global)

        texto = texto_global[start:end].strip()

        # Páginas que a questão realmente ocupa (do offset start ao end-1)
        pg_ini = offset_para_pg(start)
        pg_fim = offset_para_pg(end - 1)
        paginas = list(range(pg_ini, pg_fim + 1))

        tem_visual = any(page_data[p]['has_visual'] for p in paginas)
        tem_ref = bool(RE_REFERENCIAS_VISUAIS.search(texto))
        alts_t = pats['alt_texto'].findall(texto)
        alts_s = pats['alt_solta'].findall(texto)
        alts_visuais = len(alts_s) >= 3 and len(alts_t) < 2

        if alts_visuais:
            precisa, motivo = True, 'alternativas são imagens'
        elif len(alts_t) == 0 and len(texto) > 250:
            precisa, motivo = True, 'OCR perdeu letras das alternativas'
        elif tem_visual and tem_ref:
            precisa, motivo = True, 'enunciado referencia figura/tabela'
        elif tem_visual and len(alts_t) < 4:
            precisa, motivo = True, 'OCR incompleto + página tem visual'
        elif len(alts_t) < 4:
            precisa, motivo = True, f'só {len(alts_t)} alternativas detectadas no OCR'
        else:
            precisa, motivo = False, 'texto puro'

        questoes.append({
            'num': q,
            'paginas': paginas,
            'texto_ocr': texto,
            'formato': formato,
            'caso_compartilhado_id': questao_para_caso.get(q),
            'gabarito_oficial': gabarito.get(q),
            'tem_visual_na_pagina': tem_visual,
            'tem_referencia_textual': tem_ref,
            'alternativas_visuais': alts_visuais,
            'num_alternativas_detectadas': len(set(alts_t)) or len(set(alts_s)),
            'precisa_vision': precisa,
            'motivo_vision': motivo,
            'imagem_paths': [page_data[p]['jpeg'] for p in paginas],
        })

    return {
        'formato': formato,
        'headers_removidos': sorted(padroes_header),
        'casos_compartilhados': casos,
        'gabarito_disponivel': len(gabarito) > 0,
        'gabarito_size': len(gabarito),
        'questoes': questoes,
    }


# ---------- Métricas de qualidade ----------
def calcular_metricas(resultado: dict) -> dict:
    qs = resultado['questoes']
    if not qs:
        return {'total': 0}
    total = len(qs)
    com_4_alts = sum(1 for q in qs if q.get('num_alternativas_detectadas', 0) >= 4)
    com_gabarito = sum(1 for q in qs if q.get('gabarito_oficial'))
    com_caso = sum(1 for q in qs if q.get('caso_compartilhado_id') is not None)
    precisa_vision = sum(1 for q in qs if q.get('precisa_vision'))
    return {
        'total': total,
        'pct_alternativas_completas': round(100 * com_4_alts / total, 1),
        'pct_com_gabarito': round(100 * com_gabarito / total, 1),
        'pct_em_caso_compartilhado': round(100 * com_caso / total, 1),
        'pct_precisa_vision': round(100 * precisa_vision / total, 1),
        'casos_compartilhados_encontrados': len(resultado.get('casos_compartilhados', [])),
        'headers_removidos': len(resultado.get('headers_removidos', [])),
    }


if __name__ == '__main__':
    cadernos = [
        ('TEMI 2020',     '/mnt/project/provatemi2020aazul.pdf', None),
        ('TEMI 2021',     '/mnt/project/prova20211afasecomgabarito.pdf', None),
        ('TEMI 2022',     '/mnt/project/2022_1__Prova_TEMI.pdf', None),
        ('TEMI 2023',     '/mnt/project/prova20231afasecomgabaritoeanuladas_1.pdf', None),
        ('TEMI 2024',     '/mnt/project/2024_1__Prova_TEMI.pdf', None),
        ('TEMI 2025-rosa','/mnt/project/3fff41ccf74a4b1e93efa262216696da.pdf',
            '/mnt/project/PROVA_TEC_2025_-_TODAS_AS_QUESTO_ES-GABARITO_docx.docx'),
        ('PROVA_TEC 2025','/mnt/project/PROVA_TEC_2025__TODAS_AS_QUESTO_ESGABARITO_docx.pdf',
            '/mnt/project/PROVA_TEC_2025_-_TODAS_AS_QUESTO_ES-GABARITO_docx.docx'),
    ]

    print(f"{'Caderno':<18} {'Fmt':<10} {'Total':>5} {'4Alts':>6} {'Gab':>5} {'Casos':>5} {'Vis':>5} {'Hdr':>4}")
    print('-' * 75)
    relatorios = []
    for nome, path, gab in cadernos:
        slug = re.sub(r'\W+', '_', nome.lower())
        work = f'/home/claude/extrator/work_v3/{slug}'
        try:
            res = indexar_caderno(path, work, gab)
            m = calcular_metricas(res)
            relatorios.append({'nome': nome, **m, 'formato': res['formato']})
            print(f"{nome:<18} {res['formato']:<10} {m['total']:>5} "
                  f"{m['pct_alternativas_completas']:>5}% "
                  f"{m['pct_com_gabarito']:>4}% "
                  f"{m['pct_em_caso_compartilhado']:>4}% "
                  f"{m['pct_precisa_vision']:>4}% "
                  f"{m['headers_removidos']:>4}")
            with open(f'/home/claude/extrator/v3_{slug}.json', 'w', encoding='utf-8') as f:
                json.dump(res, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"{nome:<18} ERRO: {e}")

    with open('/home/claude/extrator/relatorio_v3.json', 'w', encoding='utf-8') as f:
        json.dump(relatorios, f, ensure_ascii=False, indent=2)
