#!/usr/bin/env python3
"""
Importa o compilado (Banco de questões TEMI) para o Supabase do MedMaestro.

- Roda na SUA máquina (que tem acesso ao banco). O sandbox do Cowork não tem rota
  de rede até o Supabase, por isso a importação é executada aqui.
- Idempotente: usa external_id (ID da questão no documento) como chave. Pode rodar
  quantas vezes quiser sem duplicar.
- Importa: exames (por fonte/ano), questões + alternativas + gabarito + taxonomia
  do documento (doc_taxonomy). NÃO importa imagens (passo separado).
- Pula AMIB 2024/2025 (já extraídos pelo pipeline).

Uso:
    python3 import_questions.py
Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY de ../../.env.local
"""
import json, os, sys, ssl
import urllib.request, urllib.error


def _ssl_ctx():
    # macOS + Python.org às vezes não tem CA bundle (SSL: CERTIFICATE_VERIFY_FAILED).
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

# IDs estáveis do projeto medmaestro
BOARD = {"AMIB": "076e6db6-bdb6-44dc-b6d5-465c04a5dcad",
         "AMI":  "50384ee1-c8ab-4083-a576-b7a06623e47b"}
SPECIALTY = "8d74efe0-d427-492b-b4a0-18a85b371bdc"


def load_env():
    env = {}
    if not os.path.exists(ENV):
        sys.exit(f"ERRO: não encontrei {ENV}")
    for ln in open(ENV, encoding="utf-8"):
        ln = ln.strip()
        if ln and not ln.startswith("#") and "=" in ln:
            k, v = ln.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


env = load_env()
BASE = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1"
KEY = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_KEY")
if not KEY:
    sys.exit("ERRO: SUPABASE_SERVICE_ROLE_KEY não encontrada no .env.local")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def req(method, path, body=None, headers=None, params=""):
    url = f"{BASE}/{path}{params}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    for k, v in {**H, **(headers or {})}.items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=120, context=CTX) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def get_or_create_exam(board, year):
    bid = BOARD[board]
    st, rows = req("GET", "exams",
                   params=(f"?select=id,booklet_color&board_id=eq.{bid}"
                           f"&specialty_id=eq.{SPECIALTY}&year=eq.{year}"))
    if isinstance(rows, list):
        for r in rows:
            if r.get("booklet_color") in (None, "", "compilado"):
                return r["id"]
    body = [{
        "board_id": bid, "specialty_id": SPECIALTY, "year": year,
        "booklet_color": None, "status": "done",
        "extractor_id": "amib_temi" if board == "AMIB" else "generico",
        "auto_comments": "none",
        "notes": "Importado do compilado (Banco de questões TEMI)",
    }]
    st, rows = req("POST", "exams", body, headers={"Prefer": "return=representation"})
    if st >= 300:
        raise RuntimeError(f"Falha criar exam {board} {year}: {st} {rows}")
    return rows[0]["id"]


def nonempty(alts):
    return {k: v.strip() for k, v in alts.items() if v and v.strip()}


def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    EXCLUDE = {("AMIB", 2024), ("AMIB", 2025)}
    data = [r for r in data if (r["source"], r["year"]) not in EXCLUDE]

    groups = {}
    for r in data:
        groups.setdefault((r["source"], r["year"]), []).append(r)

    total_q = total_ak = 0
    for (source, year), items in sorted(groups.items(), key=lambda x: (x[0][0], x[0][1])):
        exam_id = get_or_create_exam(source, year)
        q_rows, ak_rows = [], []
        for i, r in enumerate(items, start=1):
            gab = r.get("gabarito")
            ca = gab if gab in ("A", "B", "C", "D", "E") else None
            tax = dict(r.get("taxonomy") or {})
            tax["header"] = r.get("header_rest")
            tax["original_qnum"] = r.get("qnum")
            q_rows.append({
                "exam_id": exam_id, "question_number": i,
                "stem": r["stem"], "alternatives": nonempty(r["alternatives"]),
                "correct_answer": ca, "status": "pending_review",
                "has_images": False, "extraction_confidence": 5,
                "extraction_method": "import", "external_id": r["external_id"],
                "import_source": source, "doc_taxonomy": tax,
            })
            if gab in ("A", "B", "C", "D", "E"):
                ak_rows.append({"exam_id": exam_id, "question_number": i, "correct_answer": gab})
            elif gab == "X":
                ak_rows.append({"exam_id": exam_id, "question_number": i, "correct_answer": "ANULADA"})

        for ch in chunks(q_rows, 200):
            st, resp = req("POST", "questions", ch, params="?on_conflict=external_id",
                           headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
            if st >= 300:
                raise RuntimeError(f"Falha questions {source} {year}: {st} {resp}")
        for ch in chunks(ak_rows, 200):
            st, resp = req("POST", "answer_keys", ch, params="?on_conflict=exam_id,question_number",
                           headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
            if st >= 300:
                raise RuntimeError(f"Falha answer_keys {source} {year}: {st} {resp}")

        total_q += len(q_rows); total_ak += len(ak_rows)
        print(f"  {source} {year}: {len(q_rows)} questões, {len(ak_rows)} gabaritos")

    print(f"\nConcluído: {total_q} questões e {total_ak} gabaritos em {len(groups)} exames.")


if __name__ == "__main__":
    print("Importando compilado para o Supabase (medmaestro)...")
    main()
