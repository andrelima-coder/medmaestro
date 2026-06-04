#!/usr/bin/env python3
"""
Piloto Docling — roda o Docling numa prova TEMI e compara a extração de
TABELAS e FIGURAS com o pipeline atual (poppler + Vision) e o golden set.

Objetivo: decidir COM DADOS se vale incorporar o Docling (sobretudo para
reconhecimento de tabelas no enunciado, ponto fraco do pipeline atual).

Roda na máquina do usuário (precisa de internet p/ baixar os modelos do Docling
na 1ª vez). Uso:
    python3 pilot.py [caminho_do_pdf]
Sem argumento, usa a TEMI 2025 ROSA do projeto.
"""
import sys, os, json, time, glob

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.normpath(os.path.join(HERE, "..", "..", ".."))  # Antigravity/MedMaestro
GOLDEN = os.path.normpath(os.path.join(
    HERE, "..", "..", "src", "lib", "extrator", "eval", "golden", "temi_2025_rosa.json"))
OUTDIR = HERE


def find_default_pdf():
    cand = glob.glob(os.path.join(PROJ, "PROVAS-ANTERIORES", "2025", "*.pdf"))
    # caderno = o PDF com mais páginas (o gabarito tem 1 página)
    best, best_pages = None, -1
    try:
        from pypdf import PdfReader
        for f in cand:
            try:
                n = len(PdfReader(f).pages)
            except Exception:
                n = 0
            if n > best_pages:
                best, best_pages = f, n
    except Exception:
        best = max(cand, key=os.path.getsize) if cand else None
    return best


def main():
    pdf = sys.argv[1] if len(sys.argv) > 1 else find_default_pdf()
    if not pdf or not os.path.exists(pdf):
        sys.exit(f"PDF não encontrado: {pdf}")
    print(f"PDF: {pdf}")
    print("Carregando Docling (1ª vez baixa modelos, pode demorar)...", flush=True)

    from docling.document_converter import DocumentConverter
    t0 = time.time()
    conv = DocumentConverter()
    result = conv.convert(pdf)
    doc = result.document
    dt = time.time() - t0

    tables = list(getattr(doc, "tables", []) or [])
    pictures = list(getattr(doc, "pictures", []) or [])

    # exporta markdown completo p/ inspeção visual (tabelas viram markdown)
    md_path = os.path.join(OUTDIR, "docling_temi2025.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(doc.export_to_markdown())

    # salva as primeiras tabelas como markdown isolado p/ conferência clínica
    tbl_path = os.path.join(OUTDIR, "docling_tabelas.md")
    with open(tbl_path, "w", encoding="utf-8") as f:
        for i, t in enumerate(tables, 1):
            f.write(f"\n\n### Tabela {i}\n\n")
            try:
                f.write(t.export_to_markdown(doc))
            except Exception:
                try:
                    f.write(t.export_to_markdown())
                except Exception as e:
                    f.write(f"(falha ao exportar: {e})")

    # referências de comparação
    golden_total_figs = golden_q_with_fig = golden_q = 0
    if os.path.exists(GOLDEN):
        g = json.load(open(GOLDEN, encoding="utf-8"))
        qs = g.get("questions", [])
        golden_q = len(qs)
        golden_total_figs = sum(q.get("expected_figures", 0) for q in qs)
        golden_q_with_fig = sum(1 for q in qs if q.get("expected_figures", 0) > 0)

    line = "=" * 60
    print("\n" + line)
    print("PILOTO DOCLING — TEMI 2025 ROSA")
    print(line)
    print(f"Tempo de conversão Docling: {dt:.1f}s")
    print(f"Páginas processadas:        {len(getattr(doc, 'pages', []) or [])}")
    print("-" * 60)
    print("DOCLING detectou:")
    print(f"  Tabelas estruturadas: {len(tables)}")
    print(f"  Figuras (pictures):   {len(pictures)}")
    print("-" * 60)
    print("PIPELINE ATUAL (referência):")
    print("  Tabelas estruturadas: 0  (hoje a Vision 'achata' tabela em texto)")
    print("  Figuras embutidas:    109 (XObjects extraídos por pdftohtml)")
    print("-" * 60)
    print("GOLDEN SET (verificado à mão):")
    print(f"  Questões:             {golden_q}")
    print(f"  Questões com figura:  {golden_q_with_fig}")
    print(f"  Figuras esperadas:    {golden_total_figs}")
    print(line)
    print(f"Markdown completo salvo em: {md_path}")
    print(f"Tabelas isoladas em:       {tbl_path}")
    print("\nAbra os .md para conferir a FIDELIDADE das tabelas/figuras do Docling.")
    print("Critério de decisão: se as tabelas saem estruturadas e fiéis, vale")
    print("incorporar o Docling para tabelas; o resto do pipeline continua.")


if __name__ == "__main__":
    main()
