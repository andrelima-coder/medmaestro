"""
lib/supabase_client.py
======================
Cliente REST do Supabase para o Estágio 3 do pipeline de extração.

Atualizado para o schema real do projeto medmaestro:
- Tabelas: exams, questions, answer_keys, question_images
- Constraints únicos sabidos:
    questions(exam_id, question_number)
    answer_keys(exam_id, question_number)
    question_images(question_id, image_scope, figure_number)
    exams(board_id, specialty_id, year, booklet_color)

Auth: service_role_key (bypass de RLS — só rodar server-side).
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any

import requests

log = logging.getLogger(__name__)

INSERT_CHUNK_SIZE = 50
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 1.5


class SupabaseError(Exception):
    """Erro de I/O com Supabase. Inclui status, body e contexto."""

    def __init__(self, message: str, status: int | None = None, body: Any = None):
        super().__init__(message)
        self.status = status
        self.body = body


@dataclass
class SupabaseConfig:
    url: str
    service_role_key: str
    storage_bucket: str = "question-images"

    @classmethod
    def from_env(cls) -> SupabaseConfig:
        url = os.environ.get("SUPABASE_URL") or os.environ.get(
            "NEXT_PUBLIC_SUPABASE_URL"
        )
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "question-images")

        missing = []
        if not url:
            missing.append("SUPABASE_URL")
        if not key:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")
        if missing:
            raise SupabaseError(
                f"Variáveis de ambiente ausentes: {', '.join(missing)}. "
                "Configure no .env.local ou exporte antes de rodar o script."
            )

        return cls(url=url.rstrip("/"), service_role_key=key, storage_bucket=bucket)


class SupabaseClient:
    """Wrapper REST para PostgREST + Storage."""

    def __init__(self, config: SupabaseConfig, dry_run: bool = False):
        self.config = config
        self.dry_run = dry_run
        self._session = requests.Session()
        self._session.headers.update({
            "apikey": config.service_role_key,
            "Authorization": f"Bearer {config.service_role_key}",
        })

    # ------------------------------------------------------------------
    # PostgREST — operações genéricas
    # ------------------------------------------------------------------

    def upsert(
        self,
        table: str,
        rows: list[dict],
        on_conflict: str | None = None,
        returning: str = "representation",
    ) -> list[dict]:
        if not rows:
            return []

        if self.dry_run:
            log.info(
                "[DRY-RUN] upsert em %s: %d rows (on_conflict=%s).",
                table, len(rows), on_conflict,
            )
            log.debug("Amostra: %s",
                      json.dumps(rows[0], indent=2, ensure_ascii=False, default=str)[:600])
            return rows

        url = f"{self.config.url}/rest/v1/{table}"
        params = {}
        if on_conflict:
            params["on_conflict"] = on_conflict

        headers = {
            "Content-Type": "application/json",
            "Prefer": (
                f"return={returning},"
                f"resolution={'merge-duplicates' if on_conflict else 'ignore-duplicates'}"
            ),
        }

        all_results = []
        for i in range(0, len(rows), INSERT_CHUNK_SIZE):
            chunk = rows[i : i + INSERT_CHUNK_SIZE]
            log.debug("Upsert chunk %d-%d em %s", i, i + len(chunk), table)
            resp = self._request_with_retry(
                "POST", url, params=params, headers=headers, json=chunk
            )
            if returning == "representation":
                all_results.extend(resp.json())
        return all_results

    def select(
        self,
        table: str,
        columns: str = "*",
        filters: dict[str, str] | None = None,
        limit: int | None = None,
    ) -> list[dict]:
        """SELECT em PostgREST. Em dry_run, retorna [] (assume cenário pessimista)."""
        if self.dry_run:
            log.info("[DRY-RUN] select %s (filters=%s, limit=%s) → []",
                     table, filters, limit)
            return []

        url = f"{self.config.url}/rest/v1/{table}"
        params = {"select": columns}
        if filters:
            params.update(filters)
        if limit is not None:
            params["limit"] = str(limit)

        resp = self._request_with_retry("GET", url, params=params)
        return resp.json()

    # ------------------------------------------------------------------
    # Helpers específicos do schema medmaestro
    # ------------------------------------------------------------------

    def resolve_board_id(self, slug: str = "amib") -> str:
        """Busca exam_board pelo slug. Falha cedo se não encontrar."""
        if self.dry_run:
            return f"<dry-run-board-{slug}>"
        rows = self.select("exam_boards", "id", {"slug": f"eq.{slug}"}, 1)
        if not rows:
            raise SupabaseError(
                f"exam_board com slug='{slug}' não encontrado. "
                "Cadastre primeiro via SQL ou Studio."
            )
        return rows[0]["id"]

    def resolve_specialty_id(self, slug: str = "medicina-intensiva") -> str:
        """Busca specialty pelo slug."""
        if self.dry_run:
            return f"<dry-run-specialty-{slug}>"
        rows = self.select("specialties", "id", {"slug": f"eq.{slug}"}, 1)
        if not rows:
            raise SupabaseError(
                f"specialty com slug='{slug}' não encontrada. "
                "Cadastre primeiro via SQL ou Studio."
            )
        return rows[0]["id"]

    def resolve_or_create_exam(
        self,
        board_id: str,
        specialty_id: str,
        year: int,
        booklet_color: str | None,
        answer_key_color: str | None = None,
        extractor_id: str = "amib_temi",
        auto_comments: str = "none",
    ) -> tuple[str, bool]:
        """
        Busca exam por (board, specialty, year, booklet_color); cria se não existe.
        Retorna (exam_id, was_created).
        """
        # Busca
        if not self.dry_run:
            filters = {
                "board_id": f"eq.{board_id}",
                "specialty_id": f"eq.{specialty_id}",
                "year": f"eq.{year}",
            }
            if booklet_color:
                filters["booklet_color"] = f"eq.{booklet_color}"
            else:
                filters["booklet_color"] = "is.null"

            rows = self.select("exams", "id,status", filters, 1)
            if rows:
                exam_id = rows[0]["id"]
                log.info("Exam existente encontrado: %s (status=%s)",
                         exam_id, rows[0].get("status"))
                return exam_id, False

        # Cria
        new_exam = {
            "board_id": board_id,
            "specialty_id": specialty_id,
            "year": year,
            "booklet_color": booklet_color,
            "answer_key_color": answer_key_color or booklet_color,
            "status": "extracting",
            "auto_comments": auto_comments,
            "extractor_id": extractor_id,
            "extraction_progress": {
                "phase": "indexing",
                "total": 0,
                "current": 0,
                "message": "Iniciando",
                "updated_at": None,
            },
        }
        log.info("Criando exam novo: year=%d booklet_color=%s",
                 year, booklet_color or "(none)")
        result = self.upsert(
            "exams", [new_exam],
            on_conflict="board_id,specialty_id,year,booklet_color",
        )
        if not result and not self.dry_run:
            raise SupabaseError("upsert exams retornou vazio")

        exam_id = (
            result[0]["id"] if result and not self.dry_run
            else f"<dry-run-exam-{year}-{booklet_color}>"
        )
        return exam_id, True

    def update_exam_progress(
        self,
        exam_id: str,
        phase: str,
        total: int,
        current: int,
        message: str | None = None,
        status: str | None = None,
    ) -> None:
        """Atualiza extraction_progress de um exam (e opcionalmente o status)."""
        from datetime import datetime, timezone
        progress = {
            "phase": phase,
            "total": total,
            "current": current,
            "message": message,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        update = {
            "id": exam_id,
            "extraction_progress": progress,
        }
        if status:
            update["status"] = status

        if self.dry_run:
            log.info("[DRY-RUN] update exam %s progress: %s/%s phase=%s",
                     exam_id, current, total, phase)
            return

        self.upsert("exams", [update], on_conflict="id", returning="minimal")

    def insert_audit_log(self, log_entry: dict) -> None:
        """audit_logs já tem trigger automático em algumas tabelas. Use só se for evento custom."""
        if self.dry_run:
            log.debug("[DRY-RUN] audit_log: %s", log_entry.get("action_type"))
            return
        self.upsert("audit_logs", [log_entry], returning="minimal")

    def insert_api_usage(
        self,
        provider: str,
        model: str,
        operation: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
        cache_creation_input_tokens: int = 0,
        cache_read_input_tokens: int = 0,
        exam_id: str | None = None,
        question_id: str | None = None,
    ) -> None:
        """Registra uso de API Claude (RLS desabilitado nesta tabela)."""
        row = {
            "provider": provider,
            "model": model,
            "operation": operation,
            "exam_id": exam_id,
            "question_id": question_id,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cache_creation_input_tokens": cache_creation_input_tokens,
            "cache_read_input_tokens": cache_read_input_tokens,
            "cost_usd": cost_usd,
        }
        if self.dry_run:
            log.debug("[DRY-RUN] api_usage: %s %s tokens=%d/%d cost=$%.4f",
                      operation, model, input_tokens, output_tokens, cost_usd)
            return
        self.upsert("api_usage", [row], returning="minimal")

    # ------------------------------------------------------------------
    # Storage
    # ------------------------------------------------------------------

    def upload_image(
        self,
        path: str,
        data: bytes,
        content_type: str = "image/jpeg",
        upsert: bool = True,
    ) -> str:
        full_path = path.lstrip("/")

        if self.dry_run:
            log.info(
                "[DRY-RUN] upload %s/%s (%d KB, %s)",
                self.config.storage_bucket, full_path,
                len(data) // 1024, content_type,
            )
            return full_path

        url = f"{self.config.url}/storage/v1/object/{self.config.storage_bucket}/{full_path}"
        headers = {
            "Content-Type": content_type,
            "x-upsert": "true" if upsert else "false",
        }
        resp = self._request_with_retry("POST", url, headers=headers, data=data)
        log.debug("Upload OK: %s (%d KB)", full_path, len(data) // 1024)
        return full_path

    def ensure_bucket_exists(self) -> None:
        if self.dry_run:
            log.info("[DRY-RUN] bucket %s existência verificada",
                     self.config.storage_bucket)
            return

        url = f"{self.config.url}/storage/v1/bucket/{self.config.storage_bucket}"
        resp = self._session.get(url, timeout=10)
        if resp.status_code == 200:
            log.debug("Bucket %s já existe", self.config.storage_bucket)
            return

        log.info("Criando bucket %s", self.config.storage_bucket)
        create_resp = self._session.post(
            f"{self.config.url}/storage/v1/bucket",
            json={
                "id": self.config.storage_bucket,
                "name": self.config.storage_bucket,
                "public": False,
            },
            timeout=15,
        )
        if create_resp.status_code not in (200, 201):
            raise SupabaseError(
                f"Falha ao criar bucket: {create_resp.status_code}",
                status=create_resp.status_code,
                body=create_resp.text,
            )

    # ------------------------------------------------------------------
    # HTTP base com retry/backoff
    # ------------------------------------------------------------------

    def _request_with_retry(
        self,
        method: str,
        url: str,
        params: dict | None = None,
        headers: dict | None = None,
        json: Any = None,
        data: bytes | None = None,
        timeout: int = 30,
    ) -> requests.Response:
        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES):
            try:
                resp = self._session.request(
                    method, url,
                    params=params, headers=headers,
                    json=json, data=data,
                    timeout=timeout,
                )

                if 500 <= resp.status_code < 600:
                    wait = BACKOFF_BASE_SECONDS ** attempt
                    log.warning(
                        "%s %s → %d (tentativa %d/%d, aguardando %.1fs)",
                        method, url, resp.status_code,
                        attempt + 1, MAX_RETRIES, wait,
                    )
                    time.sleep(wait)
                    continue

                if 400 <= resp.status_code < 500:
                    raise SupabaseError(
                        f"{method} {url} → {resp.status_code}: {resp.text[:500]}",
                        status=resp.status_code,
                        body=resp.text,
                    )

                return resp

            except requests.RequestException as e:
                last_error = e
                wait = BACKOFF_BASE_SECONDS ** attempt
                log.warning(
                    "%s %s → exception %s (tentativa %d/%d, aguardando %.1fs)",
                    method, url, type(e).__name__,
                    attempt + 1, MAX_RETRIES, wait,
                )
                time.sleep(wait)

        raise SupabaseError(
            f"{method} {url} falhou após {MAX_RETRIES} tentativas: {last_error}"
        )
