"""Text extraction — turn uploaded document bytes into plain text.

Supported source types (matching the storage bucket's allowed MIME types):
    * application/pdf         -> pypdf page-by-page text extraction
    * text/plain              -> decoded as UTF-8 (best-effort)
    * text/markdown           -> decoded as UTF-8 (best-effort)

The extractor is deliberately dependency-light and defensive: a single bad page
never aborts the whole document, and undecodable bytes fall back to a lenient
decode rather than raising. Extraction failures that leave *no* usable text
raise :class:`ExtractionError` so the ingestion worker can mark the job failed.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import Optional

from app.core.logging import get_logger

logger = get_logger(__name__)

_PDF_MIMES = {"application/pdf"}
_TEXT_MIMES = {"text/plain", "text/markdown", "text/x-markdown"}


class ExtractionError(Exception):
    """Raised when a document yields no extractable text."""


@dataclass
class ExtractedDocument:
    """Result of extraction: the full text plus lightweight provenance."""

    text: str
    page_count: int = 0
    char_count: int = 0
    warnings: list[str] = field(default_factory=list)


def _decode_bytes(data: bytes) -> str:
    """Best-effort UTF-8 decode; fall back to latin-1 so we never hard-fail."""
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    # Last resort: replace undecodable bytes.
    return data.decode("utf-8", errors="replace")


def _extract_pdf(data: bytes) -> ExtractedDocument:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - dependency guard
        raise ExtractionError("PDF support is unavailable (pypdf not installed).") from exc

    warnings: list[str] = []
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as exc:  # pypdf raises a variety of parse errors
        raise ExtractionError("The PDF could not be parsed.") from exc

    if getattr(reader, "is_encrypted", False):
        # Try an empty-password decrypt (common for "owner-locked" PDFs).
        try:
            reader.decrypt("")
        except Exception:
            raise ExtractionError("The PDF is encrypted and cannot be read.")

    pages_text: list[str] = []
    for i, page in enumerate(reader.pages):
        try:
            pages_text.append(page.extract_text() or "")
        except Exception as exc:  # never let one page kill the whole doc
            warnings.append(f"page {i + 1} extraction failed: {type(exc).__name__}")
            pages_text.append("")

    text = "\n\n".join(t for t in pages_text if t.strip())
    if not text.strip():
        raise ExtractionError(
            "No selectable text found in the PDF (it may be a scanned image)."
        )
    return ExtractedDocument(
        text=text,
        page_count=len(reader.pages),
        char_count=len(text),
        warnings=warnings,
    )


def _extract_text_file(data: bytes) -> ExtractedDocument:
    text = _decode_bytes(data)
    if not text.strip():
        raise ExtractionError("The document is empty.")
    return ExtractedDocument(text=text, page_count=1, char_count=len(text))


def _guess_mime(file_type: Optional[str], file_key: Optional[str]) -> str:
    """Resolve an effective MIME type from the stored file_type or key suffix."""
    if file_type:
        ft = file_type.strip().lower()
        if ft in _PDF_MIMES or ft in _TEXT_MIMES:
            return ft
        # Some clients store bare extensions or short types.
        if "pdf" in ft:
            return "application/pdf"
        if "markdown" in ft or ft.endswith("md"):
            return "text/markdown"
        if "text" in ft or "plain" in ft or "txt" in ft:
            return "text/plain"
    key = (file_key or "").lower()
    if key.endswith(".pdf"):
        return "application/pdf"
    if key.endswith(".md") or key.endswith(".markdown"):
        return "text/markdown"
    if key.endswith(".txt"):
        return "text/plain"
    return "application/octet-stream"


def extract_text(
    data: bytes,
    *,
    file_type: Optional[str] = None,
    file_key: Optional[str] = None,
) -> ExtractedDocument:
    """Extract plain text from raw document bytes.

    ``file_type`` is the stored MIME type (``documents.file_type``); ``file_key``
    is the storage object key, used only as a fallback to guess the type.
    """
    if not data:
        raise ExtractionError("The uploaded file is empty.")

    mime = _guess_mime(file_type, file_key)
    if mime in _PDF_MIMES:
        return _extract_pdf(data)
    if mime in _TEXT_MIMES:
        return _extract_text_file(data)

    # Unknown type: attempt a text decode as a last resort before giving up.
    logger.warning("extractor received unsupported type '%s'; attempting text decode", mime)
    try:
        return _extract_text_file(data)
    except ExtractionError:
        raise ExtractionError(f"Unsupported document type for extraction: {mime}")
