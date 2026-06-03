#!/usr/bin/env python3
"""
Importa as IMAGENS do compilado (.docx) para o Supabase do MedMaestro.

Rode DEPOIS de import_questions.py (as questões precisam existir).

- Extrai as figuras embutidas do .docx e atribui cada uma à questão cujo
  cabeçalho ("<external_id> - <ano> - ...") aparece imediatamente acima dela,
  na ordem do documento.
- Sobe cada imagem ao Storage (bucket question-images) e cria a linha em
  question_images, marcando questions.has_images = true.
- Idempotente: re-executar substitui as imagens 'compilado/...' da questão.
- image_scope = 'statement' para todas (revisão futura pode reclassificar
  alternativas-imagem). image_type = 'outro'.

Uso:
    python3 import_images.py
"""
import json, os, sys, re, zipfile, ssl
import urllib.request, urllib.error
import xml.etree.ElementTree as ET


def _ssl_ctx():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        c = ssl.create_default_context()
        c.check_hostname = False
        c.verify_mode = ssl.CERT_NONE
        print("[aviso] certificados CA indisponíveis — verificação SSL desativada "
              "(conexão segue criptografada, ao seu próprio Supabase).")
        return c


CTX = _ssl_ctx()

HERE = os.path.dirname(os.path.abspath(__file__))
ENV = os.path.normpath(os.path.join(HERE, "..", "..", ".env.local"))
DATA = os.path.join(HERE, "compilado.json")
# .docx do compilado (na raiz do projeto Antigravity/MedMaestro)
DOCX = os.path.normpath(os.path.join(HERE, "..", "..", "..", "Banco de questões TEMI.docx"))

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
HDR = re.compile(r'^([0-9a-f]{24})\s*-\s*(\d{4})\s*-')
EXCLUDE = {("AMIB", 2024), ("AMIB", 2025)}
MIN_PX = 60  # ignora ícones/filetes


def load_env():
    env = {}
    for ln in open(ENV, encoding="utf-8"):
        ln = ln.strip()
        if ln and not ln.startswith("#") and "=" in ln:
            k, v = ln.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


env = load_env()
URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
REST = URL + "/rest/v1"
STORAGE = URL + "/storage/v1"
KEY = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_KEY")
if not KEY:
    sys.exit("ERRO: SUPABASE_SERVICE_ROLE_KEY não encontrada no .env.local")
AUTH = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


def http(method, url, body=None, headers=None, raw=False):
    data = body if raw else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(url, data=data, method=method)
    for k, v in {**AUTH, **(headers or {})}.items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=120, context=CTX) as resp:
            t = resp.read().decode()
            return resp.status, (json.loads(t) if t and not raw else t)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def text_of(p):
    return "".join(t.text or "" for t in p.iter(W + "t"))


def attribute_images():
    """Retorna {external_id: [media_name, ...]} em ordem do documento."""
    z = zipfile.ZipFile(DOCX)
    rels = ET.fromstring(z.read("word/_rels/document.xml.rels"))
    rid2target = {}
    for rel in rels:
        rid2target[rel.get("Id")] = rel.get("Target")  # ex.: media/image12.png
    doc = ET.fromstring(z.read("word/document.xml"))
    body = doc.find(W + "body")
    result = {}
    cur = None
    for child in list(body):
        txt = text_of(child).strip() if child.tag == W + "p" else ""
        m = HDR.match(txt) if txt else None
        if m:
            cur = m.group(1)
            result.setdefault(cur, [])
            continue
        for blip in child.iter(A + "blip"):
            rid = blip.get(R + "embed")
            tgt = rid2target.get(rid)
            if tgt and cur:
                name = "word/" + tgt if not tgt.startswith("word/") else tgt
                result.setdefault(cur, []).append(name)
    return z, result


def img_size(b):
    try:
        from PIL import Image
        import io
        im = Image.open(io.BytesIO(b))
        return im.size
    except Exception:
        return (9999, 9999)  # na dúvida, mantém


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    meta = {r["external_id"]: r for r in data
            if (r["source"], r["year"]) not in EXCLUDE}

    z, attribution = attribute_images()

    # mapeia external_id -> question_id no banco (em lotes)
    ext_ids = [e for e in attribution if e in meta]
    id_map = {}
    for i in range(0, len(ext_ids), 100):
        batch = ext_ids[i:i + 100]
        inlist = ",".join(batch)
        st, rows = http("GET", f"{REST}/questions?select=id,external_id&external_id=in.({inlist})",
                        headers={"Accept": "application/json"})
        if isinstance(rows, list):
            for r in rows:
                id_map[r["external_id"]] = r["id"]

    total_imgs = 0
    q_with_imgs = 0
    missing_q = 0
    touched = []
    for ext, medias in attribution.items():
        if ext not in meta or not medias:
            continue
        qid = id_map.get(ext)
        if not qid:
            missing_q += 1
            continue
        r = meta[ext]
        # limpa imagens anteriores desta importação
        http("DELETE", f"{REST}/question_images?question_id=eq.{qid}&full_page_path=like.compilado/*",
             headers={"Prefer": "return=minimal"})
        fig = 0
        rows = []
        for name in medias:
            try:
                blob = z.read(name)
            except KeyError:
                continue
            w, h = img_size(blob)
            if w < MIN_PX or h < MIN_PX:
                continue
            fig += 1
            ext_file = os.path.splitext(name)[1].lstrip(".").lower() or "png"
            ctype = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                     "gif": "image/gif", "bmp": "image/bmp", "emf": "image/emf",
                     "wmf": "image/wmf", "tiff": "image/tiff"}.get(ext_file, "application/octet-stream")
            path = f"compilado/{r['source']}/{r['year']}/{ext}/fig_{fig}.{ext_file}"
            # A URL de upload precisa do bucket; full_page_path guarda só o caminho interno.
            st, err = http("POST", f"{STORAGE}/object/question-images/{path}", body=blob, raw=True,
                           headers={"Content-Type": ctype, "x-upsert": "true"})
            if st >= 300:
                print(f"  [aviso] upload falhou {path}: {st} {str(err)[:160]}")
                fig -= 1
                continue
            rows.append({
                "question_id": qid, "image_scope": "statement", "image_type": "outro",
                "figure_number": fig, "full_page_path": path, "cropped_path": path,
                "use_cropped": True,
            })
        if rows:
            st, resp = http("POST", f"{REST}/question_images", body=rows,
                            headers={"Prefer": "return=minimal", "Content-Type": "application/json"})
            if st >= 300:
                print(f"  [aviso] insert question_images {ext}: {st} {resp}")
                continue
            http("PATCH", f"{REST}/questions?id=eq.{qid}", body={"has_images": True},
                 headers={"Prefer": "return=minimal", "Content-Type": "application/json"})
            total_imgs += len(rows); q_with_imgs += 1

    print(f"\nConcluído: {total_imgs} imagens em {q_with_imgs} questões.")
    if missing_q:
        print(f"Atenção: {missing_q} questões com imagem ainda não estavam no banco "
              f"(rode import_questions.py primeiro).")


if __name__ == "__main__":
    print("Importando imagens do compilado para o Supabase (medmaestro)...")
    print(f".docx: {DOCX}")
    if not os.path.exists(DOCX):
        sys.exit(f"ERRO: não encontrei o .docx em {DOCX}")
    main()
