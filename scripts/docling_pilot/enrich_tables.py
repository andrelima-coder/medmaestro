#!/usr/bin/env python3
"""
Enriquecimento de TABELAS via Docling (roda na VPS, onde o Docling está instalado).

Para um exame (banca/ano/caderno), baixa o PDF da prova do Supabase Storage,
roda o Docling, percorre o documento em ordem de leitura e associa cada tabela
à questão cujo "QUESTÃO N" aparece imediatamente antes. Grava o HTML das tabelas
em questions.extracted_tables (jsonb: [{html, page}, ...]).

NÃO mexe em texto nem figuras (continuam pelo pipeline atual). Idempotente:
re-rodar sobrescreve extracted_tables das questões com tabela.

Uso (com o python do venv do Docling):
    SUPA_URL=... SUPA_KEY=... /root/docling/venv/bin/python enrich_tables.py [board] [year] [booklet]
Padrão: amib 2025 rosa
"""
import os, sys, re, json, ssl, urllib.request, urllib.parse

BOARD = (sys.argv[1] if len(sys.argv) > 1 else 'amib').lower()
YEAR = int(sys.argv[2]) if len(sys.argv) > 2 else 2025
BOOKLET = (sys.argv[3] if len(sys.argv) > 3 else 'rosa').lower()

URL = (os.environ.get('SUPA_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').rstrip('/')
KEY = os.environ.get('SUPA_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')
if not URL or not KEY:
    sys.exit('Defina SUPA_URL e SUPA_KEY (ou NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).')

REST, STORAGE = URL + '/rest/v1', URL + '/storage/v1'
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}
CTX = ssl.create_default_context()


def req(method, url, body=None, headers=None, raw=False):
    data = body if raw else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(url, data=data, method=method)
    for k, v in {**H, **(headers or {})}.items():
        r.add_header(k, v)
    with urllib.request.urlopen(r, timeout=180, context=CTX) as resp:
        t = resp.read()
        return resp.status, (json.loads(t) if t and not raw else t)


def get_exam():
    st, rows = req('GET', f"{REST}/exams?select=id,source_pdf_path,board_id&year=eq.{YEAR}&booklet_color=eq.{BOOKLET}",
                   headers={'Accept': 'application/json'})
    if not rows:
        sys.exit(f'Exame não encontrado: {YEAR} {BOOKLET}')
    # se houver mais de um, tenta casar o board pelo slug
    if len(rows) > 1:
        st, boards = req('GET', f"{REST}/exam_boards?select=id&slug=eq.{BOARD}", headers={'Accept': 'application/json'})
        bid = boards[0]['id'] if boards else None
        rows = [r for r in rows if r.get('board_id') == bid] or rows
    return rows[0]['id'], rows[0]['source_pdf_path']


def download_pdf(path):
    st, data = req('GET', f"{STORAGE}/object/exam-pdfs/{urllib.parse.quote(path)}", raw=True)
    dest = '/tmp/enrich_temi.pdf'
    open(dest, 'wb').write(data)
    print(f'PDF baixado: {path} ({len(data)//1024} KB)')
    return dest


def docling_tables(pdf):
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    opts = PdfPipelineOptions(); opts.do_ocr = False
    conv = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)})
    doc = conv.convert(pdf).document

    by_q = {}
    cur = None
    qre = re.compile(r'QUEST[ÃA]O\s+(\d+)', re.I)
    for item, _level in doc.iterate_items():
        cls = type(item).__name__
        if 'Table' in cls:
            try:
                html = item.export_to_html(doc=doc)
            except TypeError:
                html = item.export_to_html()
            page = None
            prov = getattr(item, 'prov', None)
            if prov:
                page = getattr(prov[0], 'page_no', None)
            if cur is not None and html:
                by_q.setdefault(cur, []).append({'html': html, 'page': page})
        else:
            txt = getattr(item, 'text', None)
            if txt:
                m = qre.match(txt.strip())
                if m:
                    cur = int(m.group(1))
    return by_q


def main():
    exam_id, pdf_path = get_exam()
    if not pdf_path:
        sys.exit('Exame sem source_pdf_path.')
    pdf = download_pdf(pdf_path)
    print('Rodando Docling (tabelas)...')
    by_q = docling_tables(pdf)
    total_tables = sum(len(v) for v in by_q.values())
    print(f'Tabelas encontradas: {total_tables} em {len(by_q)} questões')

    updated = 0
    for qnum, tables in sorted(by_q.items()):
        st, rows = req('GET', f"{REST}/questions?select=id&exam_id=eq.{exam_id}&question_number=eq.{qnum}",
                       headers={'Accept': 'application/json'})
        if not rows:
            print(f'  Q{qnum}: questão não encontrada no banco — pulando')
            continue
        qid = rows[0]['id']
        st, _ = req('PATCH', f"{REST}/questions?id=eq.{qid}", body={'extracted_tables': tables},
                    headers={'Prefer': 'return=minimal', 'Content-Type': 'application/json'})
        if st < 300:
            updated += 1
            print(f'  Q{qnum}: {len(tables)} tabela(s) gravada(s)')
        else:
            print(f'  Q{qnum}: falha ao gravar ({st})')

    print(f'\nConcluído: {updated} questões enriquecidas com tabelas.')


if __name__ == '__main__':
    main()
