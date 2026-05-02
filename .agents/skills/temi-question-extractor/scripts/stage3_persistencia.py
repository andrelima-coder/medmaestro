#!/usr/bin/env python3
"""
stage3_persistencia.py
======================
Estágio 3 do pipeline TEMI: persiste resultado do Estágio 2 no Supabase.

Schema-alvo (schema real do projeto medmaestro):
- exams                — lote do caderno
- questions            — registro principal (alternatives JSONB, stem, etc.)
- answer_keys          — gabarito separado (a trigger sync_correct_answers
                         propaga para questions.correct_answer)
- question_images      — full_page_path + cropped_path opcional
- audit_logs           — automático via trigger
- api_usage            — opcional, para tracking de custo

Uso:
    # Dry-run (zero I/O de rede):
    python stage3_persistencia.py \\
        --input extracao/output/temi_2024_completo.json \\
        --caderno-extracted extracao/work/temi_2024 \\
        --year 2024 --booklet-color amarelo \\
        --dry-run

    # Commit:
    python stage3_persistencia.py \\
        --input ... --caderno-extracted ... \\
        --year 2024 --booklet-color amarelo \\
        --commit

Variáveis de ambiente:
    SUPABASE_URL                 ex: https://ibavtxzlejizsbtztyvl.supabase.co
    SUPABASE_SERVICE_ROLE_KEY    service role (bypass RLS, server-side only)
    SUPABASE_STORAGE_BUCKET      default: question-images

Idempotente: re-rodar com --commit não duplica
(upsert por (exam_id, question_number) e (question_id, image_scope, figure_number)).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))
from lib.image_processor import (  # noqa: E402
    CropResult,
    load_page_images_from_zip_dir,
    optimize_for_upload,
    crop_from_bbox_pct,
    build_storage_path,
)
from lib.supabase_client import (  # noqa: E402
    SupabaseClient,
    SupabaseConfig,
    SupabaseError,
)


# ----------------------------------------------------------------------------
# Logging
# ----------------------------------------------------------------------------

def setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

log = logging.getLogger("stage3")


# ----------------------------------------------------------------------------
# Stats
# ----------------------------------------------------------------------------

class Stats:
    def __init__(self) -> None:
        self.questoes_processadas = 0
        self.questoes_com_falha = 0
        self.imagens_uploaded = 0
        self.bytes_uploaded = 0
        self.full_pages_uploaded = 0
        self.crops_uploaded = 0
        self.failures: list[tuple[int, str]] = []

    def add_failure(self, num_questao: int, reason: str) -> None:
        self.questoes_com_falha += 1
        self.failures.append((num_questao, reason))

    def report(self) -> str:
        lines = [
            "",
            "=" * 60,
            "RELATÓRIO FINAL — Estágio 3",
            "=" * 60,
            f"Questões processadas com sucesso: {self.questoes_processadas}",
            f"Questões com falha:               {self.questoes_com_falha}",
            f"Imagens enviadas total:           {self.imagens_uploaded}",
            f"  ├─ páginas full original:       {self.full_pages_uploaded}",
            f"  └─ crops:                        {self.crops_uploaded}",
            f"Total enviado:                    {self.bytes_uploaded / 1024:.1f} KB",
        ]
        if self.failures:
            lines.append("")
            lines.append("Falhas detalhadas:")
            for num, reason in self.failures[:20]:
                lines.append(f"  Q{num:03d}: {reason}")
            if len(self.failures) > 20:
                lines.append(f"  ... +{len(self.failures) - 20} falhas")
        lines.append("=" * 60)
        return "\n".join(lines)


# ----------------------------------------------------------------------------
# Slug do exam (usado em paths do Storage)
# ----------------------------------------------------------------------------

def build_exam_slug(year: int, booklet_color: str | None) -> str:
    base = f"temi_{year}"
    if booklet_color:
        slug = re.sub(r"[^a-z0-9]+", "_", booklet_color.lower()).strip("_")
        if slug:
            base = f"{base}_{slug}"
    return base


# ----------------------------------------------------------------------------
# Mapeamentos JSON do Estágio 2 → schema real
# ----------------------------------------------------------------------------

ALLOWED_IMAGE_TYPES = {
    "ecg", "radiografia", "tomografia", "ultrassom",
    "grafico_pv", "grafico_guyton", "grafico_ventilacao",
    "capnografia", "rotem", "eeg", "tabela", "esquema", "outro",
}


def normalize_image_type(raw: str | None) -> str:
    """
    Normaliza valores do prompt antigo para o enum image_type_enum atual.
    Retorna 'outro' se não conseguir mapear.
    """
    if not raw:
        return "outro"
    raw = raw.lower().strip()
    if raw in ALLOWED_IMAGE_TYPES:
        return raw

    # Mapeamentos de variantes
    mapping = {
        "grafico_ventilador": "grafico_ventilacao",
        "curva_pv": "grafico_pv",
        "tabela_laboratorial": "tabela",
        "grafico_estatistico": "outro",
        "fotografia_clinica": "outro",
        "esquema_anatomico": "esquema",
    }
    return mapping.get(raw, "outro")


def map_alternatives_to_jsonb(question: dict) -> dict:
    """
    Converte alternative_a/b/c/d/e (do JSON do Estágio 2) para
    alternatives JSONB {"A": "...", "B": "..."}.
    """
    out: dict[str, str] = {}
    for letra in ("a", "b", "c", "d", "e"):
        alt = question.get(f"alternative_{letra}")
        if alt is None:
            continue
        if isinstance(alt, dict):
            text = alt.get("texto")
        else:
            text = alt
        if text is not None:
            out[letra.upper()] = text
    return out


def determine_extraction_method(question: dict) -> str:
    """Retorna 'vision' | 'ocr' | 'hybrid' baseado no JSON do Estágio 2."""
    if question.get("precisa_vision"):
        return "vision"
    if question.get("source") == "ocr":
        return "ocr"
    if question.get("source") == "hybrid":
        return "hybrid"
    # Default seguro
    return "vision"


def map_question_to_row(question: dict, exam_id: str) -> dict:
    """Converte JSON do Estágio 2 em row de `questions` (schema real)."""
    alternatives = map_alternatives_to_jsonb(question)

    # extraction_confidence: float 0-1 → smallint 0-100
    raw_conf = question.get("extraction_confidence")
    if raw_conf is None:
        confidence = None
    elif raw_conf <= 1.0:
        confidence = int(round(raw_conf * 100))
    else:
        confidence = int(round(raw_conf))
    confidence = max(0, min(100, confidence)) if confidence is not None else None

    has_images = bool(
        question.get("has_image")
        or question.get("has_images")
        or (question.get("image_principal") and question["image_principal"].get("bbox_pct"))
        or any(
            isinstance(question.get(f"alternative_{l}"), dict)
            and question[f"alternative_{l}"].get("eh_imagem")
            for l in ("a", "b", "c", "d", "e")
        )
    )

    return {
        "exam_id": exam_id,
        "question_number": question["num_questao"],
        "stem": question.get("statement") or question.get("stem", ""),
        "alternatives": alternatives,
        "status": "pending_review",
        "has_images": has_images,
        "extraction_confidence": confidence,
        "extraction_method": determine_extraction_method(question),
        "extraction_model": question.get("extraction_model", "claude-sonnet-4-5"),
    }


def map_answer_key_to_row(question: dict, exam_id: str) -> dict | None:
    """Cria row para answer_keys se a questão tem gabarito."""
    correct = question.get("correct_answer")
    if not correct:
        return None
    return {
        "exam_id": exam_id,
        "question_number": question["num_questao"],
        "correct_answer": correct.upper().strip(),
        "notes": question.get("motivo_anulacao") if question.get("anulada") else None,
    }


def map_image_to_row(
    question_id: str,
    image_scope: str,
    figure_number: int,
    full_page_path: str,
    cropped_path: str | None,
    bbox_pct: list[float] | None,
    image_type: str | None,
    description: str | None,
    page_number: int | None,
    use_cropped: bool = True,
) -> dict:
    """Cria row para question_images (schema real)."""
    bounding_box = None
    if bbox_pct and len(bbox_pct) == 4:
        bounding_box = {
            "format": "bbox_pct",
            "x1": bbox_pct[0], "y1": bbox_pct[1],
            "x2": bbox_pct[2], "y2": bbox_pct[3],
        }
    return {
        "question_id": question_id,
        "image_scope": image_scope,
        "image_type": normalize_image_type(image_type),
        "full_page_path": full_page_path,
        "cropped_path": cropped_path,
        "bounding_box": bounding_box,
        "use_cropped": bool(cropped_path) and use_cropped,
        "ai_description": description,
        "figure_number": figure_number,
        "page_number": page_number,
    }


# ----------------------------------------------------------------------------
# Operações
# ----------------------------------------------------------------------------

def upload_full_page_once(
    client: SupabaseClient,
    page_image,
    exam_slug: str,
    page_number: int,
    cache: dict,
) -> tuple[str, int]:
    """
    Sobe a página inteira (otimizada) ao Storage. Cacheia para não reupload
    da mesma página em questões diferentes.
    Retorna (storage_path, bytes_uploaded).
    """
    if page_number in cache:
        return cache[page_number], 0

    data, _, _ = optimize_for_upload(page_image, image_type=None)
    path = f"{exam_slug}/pages/p{page_number:03d}.jpg"
    client.upload_image(path=path, data=data, content_type="image/jpeg", upsert=True)
    cache[page_number] = path
    return path, len(data)


def process_question_with_images(
    client: SupabaseClient,
    question: dict,
    exam_id: str,
    page_images: dict,
    exam_slug: str,
    page_path_cache: dict,
    stats: Stats,
) -> bool:
    num_q = question["num_questao"]
    log.debug("Processando Q%03d", num_q)

    try:
        # 1. UPSERT em questions
        question_row = map_question_to_row(question, exam_id)
        upserted = client.upsert(
            "questions",
            [question_row],
            on_conflict="exam_id,question_number",
        )
        if not upserted and not client.dry_run:
            raise RuntimeError("upsert questions retornou vazio")

        question_id = (
            upserted[0]["id"] if upserted and not client.dry_run
            else f"<dry-run-uuid-q{num_q:03d}>"
        )

        # 2. UPSERT em answer_keys (se gabarito disponível)
        ak_row = map_answer_key_to_row(question, exam_id)
        if ak_row:
            client.upsert(
                "answer_keys", [ak_row],
                on_conflict="exam_id,question_number",
                returning="minimal",
            )

        # 3. Imagens — para cada uma: upload full_page (uma vez por página) +
        #    crop opcional + INSERT em question_images
        image_rows: list[dict] = []
        paginas = question.get("paginas_originais") or []
        if not paginas:
            log.warning("Q%03d sem paginas_originais (sem imagens processadas)", num_q)
        else:
            source_page = paginas[0]
            if source_page not in page_images:
                log.error("Página %d ausente para Q%03d (carregadas: %s)",
                          source_page, num_q, sorted(page_images.keys()))
            else:
                source_pil = page_images[source_page]
                full_path, bytes_full = upload_full_page_once(
                    client, source_pil, exam_slug, source_page, page_path_cache,
                )
                if bytes_full > 0:
                    stats.full_pages_uploaded += 1
                    stats.bytes_uploaded += bytes_full
                    stats.imagens_uploaded += 1

                # Imagem principal do enunciado
                img_principal = question.get("image_principal")
                if img_principal and img_principal.get("bbox_pct"):
                    cropped_path, bytes_crop = _try_crop_and_upload(
                        client, source_pil, img_principal["bbox_pct"],
                        img_principal.get("image_type"),
                        exam_slug, num_q, "statement", 1, stats,
                    )
                    image_rows.append(map_image_to_row(
                        question_id=question_id,
                        image_scope="statement",
                        figure_number=1,
                        full_page_path=full_path,
                        cropped_path=cropped_path,
                        bbox_pct=img_principal["bbox_pct"],
                        image_type=img_principal.get("image_type"),
                        description=img_principal.get("descricao_clinica"),
                        page_number=source_page,
                        use_cropped=bool(cropped_path),
                    ))

                # Alternativas-imagem
                for letra in ("a", "b", "c", "d", "e"):
                    alt = question.get(f"alternative_{letra}")
                    if not isinstance(alt, dict):
                        continue
                    if not alt.get("eh_imagem") or not alt.get("bbox_pct"):
                        continue

                    scope = f"alternative_{letra}"
                    cropped_path, bytes_crop = _try_crop_and_upload(
                        client, source_pil, alt["bbox_pct"],
                        alt.get("image_type") or (img_principal or {}).get("image_type"),
                        exam_slug, num_q, scope, 1, stats,
                    )
                    image_rows.append(map_image_to_row(
                        question_id=question_id,
                        image_scope=scope,
                        figure_number=1,
                        full_page_path=full_path,
                        cropped_path=cropped_path,
                        bbox_pct=alt["bbox_pct"],
                        image_type=alt.get("image_type") or (img_principal or {}).get("image_type"),
                        description=alt.get("texto"),
                        page_number=source_page,
                        use_cropped=bool(cropped_path),
                    ))

        if image_rows:
            client.upsert(
                "question_images", image_rows,
                on_conflict="question_id,image_scope,figure_number",
                returning="minimal",
            )

        stats.questoes_processadas += 1
        return True

    except (SupabaseError, ValueError, KeyError, RuntimeError) as e:
        log.exception("Falha ao persistir Q%03d: %s", num_q, e)
        stats.add_failure(num_q, str(e))
        return False


def _try_crop_and_upload(
    client: SupabaseClient,
    source_pil,
    bbox_pct: list[float],
    image_type: str | None,
    exam_slug: str,
    num_q: int,
    scope: str,
    figure_number: int,
    stats: Stats,
) -> tuple[str | None, int]:
    """Tenta gerar crop e fazer upload. Retorna (path | None, bytes)."""
    try:
        cropped = crop_from_bbox_pct(source_pil, bbox_pct)
        data, _, _ = optimize_for_upload(cropped, image_type)
        path = f"{exam_slug}/crops/q{num_q:03d}_{scope}_f{figure_number}.jpg"
        client.upload_image(path=path, data=data, content_type="image/jpeg", upsert=True)
        stats.crops_uploaded += 1
        stats.imagens_uploaded += 1
        stats.bytes_uploaded += len(data)
        return path, len(data)
    except (ValueError, OSError) as e:
        log.warning("Crop %s Q%03d falhou: %s — usando full_page", scope, num_q, e)
        return None, 0


# ----------------------------------------------------------------------------
# Validação
# ----------------------------------------------------------------------------

def validate_input(data: dict) -> tuple[bool, list[str]]:
    erros: list[str] = []

    if "questions" not in data:
        erros.append("JSON sem chave 'questions'")
        return False, erros

    if not isinstance(data["questions"], list):
        erros.append("'questions' não é uma lista")
        return False, erros

    if not data["questions"]:
        erros.append("'questions' está vazio")
        return False, erros

    nums_vistos = set()
    for i, q in enumerate(data["questions"]):
        if "num_questao" not in q:
            erros.append(f"Questão #{i} sem num_questao")
            continue
        if q["num_questao"] in nums_vistos:
            erros.append(f"num_questao duplicado: {q['num_questao']}")
        nums_vistos.add(q["num_questao"])

    return len(erros) == 0, erros


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Estágio 3 v2 — Persistência no schema real do medmaestro",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--input", required=True, type=Path,
                        help="JSON do Estágio 2")
    parser.add_argument("--caderno-extracted", required=True, type=Path,
                        help="Diretório com os JPEGs extraídos do ZIP")
    parser.add_argument("--year", required=True, type=int,
                        help="Ano da prova (ex: 2024)")
    parser.add_argument("--booklet-color", required=False, type=str, default=None,
                        help="Cor do caderno (ex: amarelo, rosa)")
    parser.add_argument("--board-slug", default="amib",
                        help="Slug do exam_board (default: amib)")
    parser.add_argument("--specialty-slug", default="medicina-intensiva",
                        help="Slug da specialty (default: medicina-intensiva)")
    parser.add_argument("--extractor-id", default="amib_temi",
                        help="extractor_id (default: amib_temi)")
    parser.add_argument("--auto-comments", default="none",
                        choices=["none", "simple", "hybrid"],
                        help="Modo de auto-comments (default: none)")

    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--commit", action="store_true")

    parser.add_argument("--limit", type=int, default=None,
                        help="Processar no máximo N questões (calibração)")
    parser.add_argument("--verbose", "-v", action="store_true")

    args = parser.parse_args()
    setup_logging(args.verbose)

    if not args.input.exists():
        log.error("Input não existe: %s", args.input)
        return 2
    if not args.caderno_extracted.is_dir():
        log.error("Diretório do caderno não existe: %s", args.caderno_extracted)
        return 2

    log.info("Modo: %s", "DRY-RUN" if args.dry_run else "COMMIT")
    log.info("Input: %s", args.input)
    log.info("Year: %d / Cor: %s", args.year, args.booklet_color or "(none)")

    with args.input.open(encoding="utf-8") as f:
        data = json.load(f)

    ok, erros = validate_input(data)
    if not ok:
        log.error("Validação falhou:")
        for e in erros:
            log.error("  - %s", e)
        return 3

    questions = data["questions"]
    if args.limit:
        questions = questions[: args.limit]
        log.info("Limite: %d questões", len(questions))

    log.info("Carregando páginas...")
    page_images = load_page_images_from_zip_dir(args.caderno_extracted)
    if not page_images:
        log.error("Nenhuma página em %s", args.caderno_extracted)
        return 4

    try:
        config = SupabaseConfig.from_env()
    except SupabaseError as e:
        log.error("%s", e)
        return 5

    client = SupabaseClient(config, dry_run=args.dry_run)
    stats = Stats()
    exam_slug = build_exam_slug(args.year, args.booklet_color)
    page_path_cache: dict = {}

    try:
        client.ensure_bucket_exists()
        board_id = client.resolve_board_id(args.board_slug)
        specialty_id = client.resolve_specialty_id(args.specialty_slug)

        exam_id, criado = client.resolve_or_create_exam(
            board_id=board_id,
            specialty_id=specialty_id,
            year=args.year,
            booklet_color=args.booklet_color,
            extractor_id=args.extractor_id,
            auto_comments=args.auto_comments,
        )
        log.info("Exam: %s (criado=%s, slug=%s)", exam_id, criado, exam_slug)

        client.update_exam_progress(
            exam_id, phase="persisting",
            total=len(questions), current=0,
            message="Iniciando persistência",
            status="extracting",
        )

        for i, q in enumerate(questions, 1):
            log.info("Processando %d/%d: Q%03d", i, len(questions), q["num_questao"])
            process_question_with_images(
                client, q, exam_id, page_images, exam_slug, page_path_cache, stats,
            )

            if i % 10 == 0:
                client.update_exam_progress(
                    exam_id, phase="persisting",
                    total=len(questions), current=i,
                    message=f"Persistindo questão {i}/{len(questions)}",
                )

        # Update final do progresso e status
        final_status = "extracted" if stats.questoes_com_falha == 0 else "error"
        client.update_exam_progress(
            exam_id,
            phase="done" if stats.questoes_com_falha == 0 else "error",
            total=len(questions),
            current=stats.questoes_processadas,
            message=(
                "Extração concluída"
                if stats.questoes_com_falha == 0
                else f"Concluído com {stats.questoes_com_falha} falhas"
            ),
            status=final_status,
        )

    except SupabaseError as e:
        log.exception("Erro fatal de Supabase: %s", e)
        log.error("Body: %s", e.body)
        return 6

    print(stats.report())
    return 0 if stats.questoes_com_falha == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
