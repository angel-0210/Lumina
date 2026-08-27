"""Embedding service — the single seam the app uses to turn text into vectors.

Wraps the Gemini provider so the rest of the codebase (ingestion, retrieval,
tests) depends on one stable interface rather than the provider directly. All
embeddings are produced at ``settings.embedding_dim`` (1536) to match the
``document_chunks.embedding vector(1536)`` column and its HNSW cosine index; a
dimension mismatch is treated as a hard error rather than silently stored.
"""

from __future__ import annotations

from app.core.config import settings
from app.core.exceptions import ProviderError
from app.core.logging import get_logger

from . import gemini_provider

logger = get_logger(__name__)


def _validate_dim(vector: list[float]) -> list[float]:
    expected = settings.embedding_dim
    if vector and len(vector) != expected:
        raise ProviderError(
            f"Embedding dimensionality mismatch (got {len(vector)}, expected {expected})."
        )
    return vector


def embed_documents(texts: list[str], *, batch_size: int = 64) -> list[list[float]]:
    """Embed a list of document chunks (RETRIEVAL_DOCUMENT task)."""
    if not texts:
        return []
    out: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        result = gemini_provider.embed_texts(batch, task_type="RETRIEVAL_DOCUMENT")
        if len(result.embeddings) != len(batch):
            raise ProviderError("Embedding provider returned a mismatched batch size.")
        for vec in result.embeddings:
            _validate_dim(vec)
        out.extend(result.embeddings)
    return out


def embed_query(query: str) -> list[float]:
    """Embed a single search query (RETRIEVAL_QUERY task)."""
    vector = gemini_provider.embed_query(query)
    return _validate_dim(vector)
