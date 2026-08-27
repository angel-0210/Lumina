"""RAG ingestion pipeline: storage bytes -> chunks -> embeddings -> vector store.

This is the heart of the "real RAG" requirement. It is called by the ingestion
worker (never inline in an HTTP request) and reports progress through an optional
callback so the ``document_processing_jobs`` row stays current.

Pipeline stages (with rough progress weighting):
    download (10%) -> extract (25%) -> chunk (35%) -> embed (85%) -> store (100%)

The pipeline is split into a **prepare** phase (download/extract/chunk/embed —
no database, potentially slow) and a **persist** phase (delete + bulk insert —
a short transaction). The worker runs prepare without holding a transaction
open, then persists in a brief committed transaction, avoiding
"idle-in-transaction" connections during the long embedding call.

Embeddings are generated in batches at 1536 dimensions to match the
``document_chunks.embedding vector(1536)`` column and its HNSW cosine index.

Storage: document bytes are fetched from Cloudinary via ``file_key``
(the Cloudinary secure_url stored in ``documents.file_key`` at upload time).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from sqlalchemy.engine import Connection

from app.ai import embedding_service
from app.core.logging import get_logger
from app.integrations import cloudinary_client
from app.repositories import chunk_repo

from .chunker import Chunk, chunk_text
from .extractor import ExtractionError, extract_text

logger = get_logger(__name__)

ProgressCb = Callable[[int, str], None]


class IngestionError(Exception):
    """Raised when ingestion cannot produce a usable, embedded chunk set."""


@dataclass
class IngestionResult:
    chunk_count: int
    embedded_count: int
    page_count: int
    char_count: int
    warnings: list[str] = field(default_factory=list)


@dataclass
class PreparedChunks:
    """Chunk rows (with embeddings) ready to persist, plus a result summary."""

    rows: list[dict[str, Any]]
    result: IngestionResult


def _noop(_pct: int, _msg: str) -> None:  # default progress sink
    return None


def prepare_chunks(
    *,
    file_key: str,
    file_type: Optional[str] = None,
    progress_cb: Optional[ProgressCb] = None,
) -> PreparedChunks:
    """Download -> extract -> chunk -> embed. Performs **no** database I/O.

    Raises :class:`IngestionError` / :class:`ExtractionError` on unrecoverable
    problems so the worker can mark the job failed with a safe message.
    """
    report = progress_cb or _noop

    # 1. Download source bytes from Cloudinary (file_key is the secure_url).
    report(5, "Downloading source file")
    data = cloudinary_client.download_bytes(file_key)
    report(10, "Downloaded source file")

    # 2. Extract text.
    report(15, "Extracting text")
    extracted = extract_text(data, file_type=file_type, file_key=file_key)
    report(25, "Extracted text")

    # 3. Clean + chunk (chunk_text cleans internally).
    report(30, "Splitting into chunks")
    chunks: list[Chunk] = chunk_text(extracted.text)
    if not chunks:
        raise IngestionError("The document produced no usable text chunks.")
    report(35, f"Created {len(chunks)} chunks")

    # 4. Embed in batches.
    report(40, "Generating embeddings")
    texts = [c.content for c in chunks]
    embeddings = embedding_service.embed_documents(texts)
    if len(embeddings) != len(chunks):
        raise IngestionError("Embedding count did not match chunk count.")
    report(85, "Embeddings generated")

    rows: list[dict[str, Any]] = []
    embedded = 0
    for chunk, embedding in zip(chunks, embeddings):
        row = chunk.as_row()
        if embedding:
            row["embedding"] = embedding
            embedded += 1
        rows.append(row)

    result = IngestionResult(
        chunk_count=len(chunks),
        embedded_count=embedded,
        page_count=extracted.page_count,
        char_count=extracted.char_count,
        warnings=extracted.warnings,
    )
    return PreparedChunks(rows=rows, result=result)


def persist_chunks(
    conn: Connection,
    *,
    document_id: str,
    rows: list[dict[str, Any]],
    replace_existing: bool = True,
) -> int:
    """Persist prepared chunk rows in the caller's transaction (short-lived)."""
    if replace_existing:
        chunk_repo.delete_by_document(conn, document_id)
    return chunk_repo.bulk_insert(conn, document_id, rows)


def ingest_document(
    conn: Connection,
    *,
    document_id: str,
    file_key: str,
    file_type: Optional[str] = None,
    progress_cb: Optional[ProgressCb] = None,
    replace_existing: bool = True,
) -> IngestionResult:
    """Convenience: prepare + persist in the caller's transaction.

    Used by tests and any caller comfortable holding one transaction across the
    whole pipeline. The worker uses :func:`prepare_chunks` / :func:`persist_chunks`
    directly so it does not hold a transaction during embedding.
    """
    prepared = prepare_chunks(file_key=file_key, file_type=file_type, progress_cb=progress_cb)
    persist_chunks(
        conn,
        document_id=document_id,
        rows=prepared.rows,
        replace_existing=replace_existing,
    )
    (progress_cb or _noop)(100, "Stored chunks")
    logger.info(
        "ingested document %s: %d chunks (%d embedded)",
        document_id,
        prepared.result.chunk_count,
        prepared.result.embedded_count,
    )
    return prepared.result
