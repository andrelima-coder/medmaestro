"""
lib/image_processor.py
======================
Geração de crops e otimização de imagens para upload no Supabase Storage.

Princípios:
- Manter legibilidade clínica (ECG/RX/TC requerem fidelidade)
- Reduzir tamanho do arquivo (1200x1700 RAW JPEG é ~500KB; alvo: <200KB/imagem)
- Bbox em percentual da imagem original (0-100), conforme convenção
  do prompt do Estágio 2

Para imagens com texto (tabelas, gráficos com legendas), a compressão
agressiva pode prejudicar OCR humano. Use `quality=90` para essas.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

log = logging.getLogger(__name__)

# Dimensão máxima do lado maior após resize. ECG e RX precisam de 1600+ para
# ficarem legíveis; tabelas e gráficos simples ficam OK com 1200.
MAX_DIMENSION_HIGH_FIDELITY = 1600  # ECG, EEG, RX, TC, esquemas anatômicos
MAX_DIMENSION_STANDARD = 1200  # tabelas, gráficos simples, fotos clínicas

# Qualidade JPEG (1-100). 85 é o sweet spot para fotos; 92 para imagens com
# linhas finas (ECG); 95+ desperdiça bytes sem ganho perceptível.
JPEG_QUALITY_HIGH_FIDELITY = 92
JPEG_QUALITY_STANDARD = 85

# Tipos que merecem alta fidelidade (preservam linhas finas, anotações)
HIGH_FIDELITY_TYPES = {
    "ecg",
    "radiografia",
    "tomografia",
    "ultrassom",
    "grafico_ventilador",
    "curva_pv",
    "esquema_anatomico",
}


@dataclass
class CropResult:
    """Resultado da geração de um crop. Pronto para subir no Storage."""

    bytes_data: bytes
    storage_path: str  # caminho relativo dentro do bucket
    width: int
    height: int
    size_bytes: int
    image_type: str | None
    description: str | None


def _resolve_quality(image_type: str | None) -> tuple[int, int]:
    """Retorna (max_dimension, jpeg_quality) baseado em image_type."""
    if image_type in HIGH_FIDELITY_TYPES:
        return MAX_DIMENSION_HIGH_FIDELITY, JPEG_QUALITY_HIGH_FIDELITY
    return MAX_DIMENSION_STANDARD, JPEG_QUALITY_STANDARD


def crop_from_bbox_pct(
    source_image: Image.Image,
    bbox_pct: list[float] | tuple[float, float, float, float],
) -> Image.Image:
    """
    Recorta região definida por bbox em percentual da imagem original (0-100).

    Args:
        source_image: PIL Image
        bbox_pct: [x1, y1, x2, y2] em % (0-100), top-left + bottom-right

    Returns:
        PIL Image do crop (modo RGB, sem transparência)

    Raises:
        ValueError: bbox malformado ou fora dos limites
    """
    if len(bbox_pct) != 4:
        raise ValueError(f"bbox_pct deve ter 4 elementos, recebido {len(bbox_pct)}")

    x1_pct, y1_pct, x2_pct, y2_pct = bbox_pct

    # Tolerância: aceitamos valores levemente fora de [0,100] (modelos às
    # vezes retornam 100.5 etc) e fazemos clamping
    def clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
        return max(lo, min(hi, float(v)))

    x1 = clamp(x1_pct) / 100.0 * source_image.width
    y1 = clamp(y1_pct) / 100.0 * source_image.height
    x2 = clamp(x2_pct) / 100.0 * source_image.width
    y2 = clamp(y2_pct) / 100.0 * source_image.height

    if x2 <= x1 or y2 <= y1:
        raise ValueError(
            f"Bbox inválido após resolução: "
            f"x=({x1:.0f},{x2:.0f}) y=({y1:.0f},{y2:.0f})"
        )

    cropped = source_image.crop((int(x1), int(y1), int(x2), int(y2)))
    if cropped.mode != "RGB":
        cropped = cropped.convert("RGB")
    return cropped


def optimize_for_upload(
    image: Image.Image,
    image_type: str | None = None,
) -> tuple[bytes, int, int]:
    """
    Redimensiona (mantendo aspect ratio) e comprime para JPEG.

    Returns:
        (bytes, width, height) — bytes prontos para upload, dimensões finais.
    """
    max_dim, quality = _resolve_quality(image_type)

    # Resize se necessário (mantém aspect ratio)
    if max(image.width, image.height) > max_dim:
        scale = max_dim / max(image.width, image.height)
        new_size = (int(image.width * scale), int(image.height * scale))
        image = image.resize(new_size, Image.Resampling.LANCZOS)

    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=quality, optimize=True)
    data = buf.getvalue()
    return data, image.width, image.height


def build_storage_path(
    batch_slug: str,
    num_questao: int,
    role: str,
    extension: str = "jpg",
) -> str:
    """
    Convenção de nome de arquivo no bucket.

    role: 'principal' | 'alt_a' | 'alt_b' | 'alt_c' | 'alt_d' | 'alt_e' |
          'figura_2' | etc.

    Exemplo: "temi_2024_amarelo/q008_principal.jpg"
    """
    return f"{batch_slug}/q{num_questao:03d}_{role}.{extension}"


def process_question_images(
    question: dict,
    page_images: dict[int, Image.Image],
    batch_slug: str,
) -> list[CropResult]:
    """
    Processa todas as imagens de uma questão (principal + alternativas-imagem).

    Args:
        question: dict do Estágio 2 com keys image_principal, alternative_a..e,
                  paginas_originais
        page_images: dict {page_number -> PIL Image} já carregadas das páginas
                     do caderno fonte
        batch_slug: slug curto do batch (ex: "temi_2024_amarelo")

    Returns:
        Lista de CropResult prontos para upload + INSERT em question_images.
    """
    results: list[CropResult] = []
    num_q = question["num_questao"]
    paginas = question.get("paginas_originais") or []

    if not paginas:
        log.warning("Questão %d sem paginas_originais — pulando crops", num_q)
        return results

    # Estratégia: usamos a primeira página da questão como source default.
    # Se a questão atravessa páginas (ex: enunciado pg 5, alts pg 6), o
    # bbox precisa indicar de qual página é. No JSON do Estágio 2, ainda
    # não temos esse campo — assumimos primeira página até que o prompt
    # passe a retornar `source_page` explícito.
    source_page = paginas[0]
    if source_page not in page_images:
        log.error(
            "Página %d não disponível para questão %d (páginas carregadas: %s)",
            source_page, num_q, sorted(page_images.keys()),
        )
        return results

    source = page_images[source_page]

    # Imagem principal do enunciado
    img_principal = question.get("image_principal")
    if img_principal and img_principal.get("bbox_pct"):
        try:
            cropped = crop_from_bbox_pct(source, img_principal["bbox_pct"])
            data, w, h = optimize_for_upload(cropped, img_principal.get("image_type"))
            results.append(CropResult(
                bytes_data=data,
                storage_path=build_storage_path(batch_slug, num_q, "principal"),
                width=w, height=h, size_bytes=len(data),
                image_type=img_principal.get("image_type"),
                description=img_principal.get("descricao_clinica"),
            ))
        except ValueError as e:
            log.error("Crop principal Q%d falhou: %s", num_q, e)

    # Alternativas que são imagens
    for letra in ("a", "b", "c", "d", "e"):
        alt = question.get(f"alternative_{letra}")
        if not alt or not alt.get("eh_imagem") or not alt.get("bbox_pct"):
            continue
        try:
            cropped = crop_from_bbox_pct(source, alt["bbox_pct"])
            # alternativas geralmente são gráficos ou ECGs em miniatura.
            # Tratamos como high-fidelity por segurança.
            img_type = img_principal.get("image_type") if img_principal else None
            data, w, h = optimize_for_upload(cropped, img_type)
            results.append(CropResult(
                bytes_data=data,
                storage_path=build_storage_path(batch_slug, num_q, f"alt_{letra}"),
                width=w, height=h, size_bytes=len(data),
                image_type=img_type,
                description=alt.get("texto"),  # texto = descrição clínica para alts-imagem
            ))
        except ValueError as e:
            log.error("Crop alt_%s Q%d falhou: %s", letra, num_q, e)

    return results


def load_page_images_from_zip_dir(zip_extracted_dir: Path) -> dict[int, Image.Image]:
    """
    Carrega todas as páginas-imagem de um diretório extraído do caderno
    (estrutura: {1.jpeg, 2.jpeg, ..., manifest.json}).

    Returns:
        Dict {page_number -> PIL Image}, lazy-loaded (não decodifica até ser usado).
    """
    pages: dict[int, Image.Image] = {}
    for jpeg_file in sorted(zip_extracted_dir.glob("*.jpeg")):
        try:
            page_num = int(jpeg_file.stem)
        except ValueError:
            continue  # skipa arquivos que não são página numerada
        pages[page_num] = Image.open(jpeg_file)
    log.info("Carregadas %d páginas de %s", len(pages), zip_extracted_dir)
    return pages
