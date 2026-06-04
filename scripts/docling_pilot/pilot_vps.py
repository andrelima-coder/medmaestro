#!/usr/bin/env python3
"""
Piloto Docling — versão VPS (Docling já instalado).

Roda na VPS Hostinger usando o Docling existente. Baixa a prova TEMI 2025 ROSA
direto do Supabase Storage (bucket exam-pdfs), roda o Docling e compara a
extração de TABELAS e FIGURAS com o pipeline atual e o golden set.

Uso na VPS (no diretório do repo):
    python3 scripts/docling_pilot/pilot_vps.py
    # ou, se o docling estiver num venv:
    /caminho/do/venv/bin/python scripts/docling_pilot/pilot_vps.py

Credenciais: lê de variáveis de ambiente ou de um .env (.env.production /
.env.local) procurado nas pastas acima do script.
"""
import os, sys, json, glob, time, ssl
import urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.normpath(os.path.join(
    HERE, "..", "..", "src", "lib", "extrator", "eval", "golden", "temi_2025_rosa.json"))


def _ssl_ctx():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


CTX = _ssl_ctx()


def load_env():
    env = dict(os.environ)
    if env.get("NEXT_PUBLIC_SUPABASE_URL") and (
        env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_KEY")
    ):
        return env
    candidates = [
        os.path.join(HERE, "..", "..", ".env.production"),
        os.path.join(HERE, "..", "..", ".env.local"),
        os.path.join(HERE, "..", "..", "..", ".env.production"),
        os.path.join(HERE, "..", "..", "..", ".env.local"),
    ]
    for c in candidates:
        c = os.path.normpath(c)
        if os.path.exists(c):
            for ln in open(c, encoding="utf-8"):
                ln = ln.strip()
                if ln and not ln.startswith("#") and "=" in ln:
                    k, v = ln.split("=", 1)
                    env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            break
    return env


def http(method, url, headers=None):
    r = urllib.request.Request(url, method=method)
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    with urllib.request.urlopen(r, timeout=120, context=CTX) as resp:
        return resp.status, resp.read()


def get_temi_pdf(env):
    base = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_KEY")
    H = {"apikey": key, "Authorization": f"Bearer {key}"}
    # AMIB 2025 rosa
    q = ("/rest/v1/exams?select=source_pdf_path,year,booklet_color"
         "&year=eq.2025&booklet_color=eq.rosa&limit=1")
    st, body = http("GET", base + q, {**H, "Accept": "application/json"})
    rows = json.loads(body)
    if not rows or not rows[0].get("source_pdf_path"):
        raise SystemExit("Não achei o source_pdf_path da TEMI 2025 rosa no banco.")
    path = rows[0]["source_pdf_path"]
    st, pdf = http("GET", f"{base}/storage/v1/object/exam-pdfs/{path}", H)
    dest = "/tmp/temi_2025_rosa.pdf"
    open(dest, "wb").write(pdf)
    print(f"PDF baixado do Storage: {path} -> {dest} ({len(pdf)//1024} KB)")
    return dest


def main():
    pdf = sys.argv[1] if len(sys.argv) > 1 else None
    if not pdf:
        env = load_env()
        if not env.get("NEXT_PUBLIC_SUPABASE_URL"):
            sys.exit("Sem PDF e sem credenciais Supabase. Passe o caminho do PDF como argumento.")
        pdf = get_temi_pdf(env)
    if not os.path.exists(pdf):
        sys.exit(f"PDF não encontrado: {pdf}")

    print("Carregando Docling...", flush=True)
    from docling.document_converter import DocumentConverter
    t0 = time.time()
    doc = DocumentConverter().convert(pdf).document
    dt = time.time() - t0

    tables = list(getattr(doc, "tables", []) or [])
    pictures = list(getattr(doc, "pictures", []) or [])

    md_path = os.path.join(HERE, "docling_temi2025.md")
    open(md_path, "w", encoding="utf-8").write(doc.export_to_markdown())
    with open(os.path.join(HERE, "docling_tabelas.md"), "w", encoding="utf-8") as f:
        for i, t in enumerate(tables, 1):
            f.write(f"\n\n### Tabela {i}\n\n")
            try:
                f.write(t.export_to_markdown(doc))
            except Exception:
                try:
                    f.write(t.export_to_markdown())
                except Exception as e:
                    f.write(f"(falha: {e})")

    g_total = g_with = g_q = 0
    if os.path.exists(GOLDEN):
        g = json.load(open(GOLDEN, encoding="utf-8")).get("questions", [])
        g_q = len(g)
        g_total = sum(q.get("expected_figures", 0) for q in g)
        g_with = sum(1 for q in g if q.get("expected_figures", 0) > 0)

    L = "=" * 60
    print("\n" + L)
    print("PILOTO DOCLING (VPS) — TEMI 2025 ROSA")
    print(L)
    print(f"Conversão: {dt:.1f}s | Páginas: {len(getattr(doc,'pages',[]) or [])}")
    print("-" * 60)
    print(f"DOCLING  -> tabelas estruturadas: {len(tables)} | figuras: {len(pictures)}")
    print("PIPELINE -> tabelas estruturadas: 0 (achatadas em texto) | figuras embutidas: 109")
    print(f"GOLDEN   -> questões: {g_q} | com figura: {g_with} | figuras esperadas: {g_total}")
    print(L)
    print(f"Markdown: {md_path}")
    print(f"Tabelas:  {os.path.join(HERE, 'docling_tabelas.md')}")


if __name__ == "__main__":
    main()
