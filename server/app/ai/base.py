"""Shared AI result types and token estimation."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def estimate_tokens(text: str) -> int:
    """Rough token estimate (~4 chars/token) used when the API omits usage data."""
    if not text:
        return 0
    return max(1, len(text) // 4)


@dataclass
class GenerationResult:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0
    model: str = ""
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class EmbeddingResult:
    embeddings: list[list[float]]
    model: str = ""
    dim: int = 0


@dataclass
class RetrievedChunk:
    """A chunk returned by retrieval, with provenance for citations."""

    chunk_id: str
    document_id: str
    document_title: str
    content: str
    chunk_index: int
    score: float
    method: str = "vector"

    def source_label(self) -> str:
        """Human-readable citation label, e.g. 'Doc Title · chunk 12'."""
        title = self.document_title or "Document"
        return f"{title} · section {self.chunk_index + 1}"
