"""Context assembly — turn retrieved chunks into a numbered prompt block.

Produces the ``[S1]/[S2]/...`` numbered source text the model is instructed to
cite, while respecting ``RAG_MAX_CONTEXT_CHARS`` so we never blow the model's
context window. Also emits citation payloads (source label, snippet, score,
rank) that the service layer maps onto the ``Citation`` DTO returned to clients.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.ai.base import RetrievedChunk
from app.core.config import settings

_SNIPPET_CHARS = 240


@dataclass
class AssembledContext:
    numbered_sources: str
    used_chunks: list[RetrievedChunk] = field(default_factory=list)
    citations: list[dict] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not self.used_chunks


def _snippet(content: str, limit: int = _SNIPPET_CHARS) -> str:
    content = " ".join(content.split())
    if len(content) <= limit:
        return content
    return content[:limit].rsplit(" ", 1)[0].rstrip() + "…"


def assemble_context(
    chunks: list[RetrievedChunk],
    *,
    max_chars: int | None = None,
) -> AssembledContext:
    """Assemble numbered sources from ranked chunks within the char budget.

    Chunks are consumed in rank order; a chunk that would overflow the budget is
    truncated to fit, and once the budget is exhausted remaining chunks are
    dropped. Citation metadata is only emitted for chunks actually included.
    """
    max_chars = max_chars or settings.rag_max_context_chars
    blocks: list[str] = []
    used: list[RetrievedChunk] = []
    citations: list[dict] = []
    budget = max_chars

    for chunk in chunks:
        if budget <= 0:
            break
        label = f"S{len(used) + 1}"
        header = f"[{label}] Source: {chunk.source_label()}\n"
        body = chunk.content.strip()

        available = budget - len(header)
        if available <= 0:
            break
        if len(body) > available:
            body = body[:available].rsplit(" ", 1)[0].rstrip() + "…"

        block = header + body
        blocks.append(block)
        budget -= len(block) + 2  # account for the joining blank line

        used.append(chunk)
        citations.append(
            {
                "id": label,
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.document_id,
                "document_title": chunk.document_title,
                "label": chunk.source_label(),
                "score": round(chunk.score, 6),
                "snippet": _snippet(chunk.content),
                "rank": len(used),
            }
        )

    return AssembledContext(
        numbered_sources="\n\n".join(blocks),
        used_chunks=used,
        citations=citations,
    )


def source_labels(citations: list[dict]) -> list[str]:
    """Extract the human-readable ``sources`` string list for ChatMessage."""
    seen: set[str] = set()
    labels: list[str] = []
    for c in citations:
        label = c.get("label") or ""
        if label and label not in seen:
            seen.add(label)
            labels.append(label)
    return labels
