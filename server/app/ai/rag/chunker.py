"""Text cleaning and chunking for the RAG pipeline.

Chunking strategy: paragraph- and sentence-aware sliding window measured in
characters (``RAG_CHUNK_SIZE`` target, ``RAG_CHUNK_OVERLAP`` overlap). We avoid
splitting mid-sentence where possible so each chunk reads as a coherent unit,
which improves both embedding quality and the readability of cited sources.

Each chunk carries a stable ``chunk_hash`` (SHA-256 of the normalized content)
used by the DB's ``doc_chunk_hash_unique`` constraint to dedupe identical chunks
and make re-ingestion idempotent.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from app.ai.base import estimate_tokens
from app.core.config import settings

# Collapse 3+ blank lines, normalize whitespace, strip control chars.
_MULTI_NEWLINE = re.compile(r"\n{3,}")
_TRAILING_WS = re.compile(r"[ \t]+(\n)")
_CTRL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
# Sentence boundary: end punctuation followed by whitespace + capital/quote/digit.
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[\"'(\[A-Z0-9])")
# Paragraph boundary.
_PARAGRAPH_SPLIT = re.compile(r"\n\s*\n")


@dataclass
class Chunk:
    content: str
    chunk_index: int
    chunk_hash: str
    token_count: int

    def as_row(self) -> dict:
        """Shape expected by ``chunk_repo.bulk_insert`` (embedding added later)."""
        return {
            "content": self.content,
            "chunk_index": self.chunk_index,
            "chunk_hash": self.chunk_hash,
            "token_count": self.token_count,
            "embedding": None,
        }


def clean_text(raw: str) -> str:
    """Normalize whitespace and strip control characters without losing structure."""
    if not raw:
        return ""
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    text = _CTRL_CHARS.sub("", text)
    text = _TRAILING_WS.sub(r"\1", text)
    text = _MULTI_NEWLINE.sub("\n\n", text)
    # De-hyphenate words broken across line breaks: "exam-\nple" -> "example".
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    return text.strip()


def _hash(content: str) -> str:
    return hashlib.sha256(content.strip().encode("utf-8")).hexdigest()


def _split_sentences(paragraph: str) -> list[str]:
    parts = _SENTENCE_SPLIT.split(paragraph.strip())
    return [p.strip() for p in parts if p.strip()]


def _segments(text: str) -> list[str]:
    """Break text into sentence-level segments, respecting paragraph breaks."""
    segments: list[str] = []
    for para in _PARAGRAPH_SPLIT.split(text):
        para = para.strip()
        if not para:
            continue
        segments.extend(_split_sentences(para))
    return segments


def _overlap_tail(text: str, overlap: int) -> str:
    """Return roughly the last ``overlap`` characters, snapped to a word boundary."""
    if overlap <= 0 or len(text) <= overlap:
        return text if len(text) <= overlap else ""
    tail = text[-overlap:]
    # Snap to the next word boundary so we don't start mid-word.
    space = tail.find(" ")
    if 0 < space < len(tail) - 1:
        tail = tail[space + 1 :]
    return tail.strip()


def chunk_text(
    text: str,
    *,
    chunk_size: int | None = None,
    overlap: int | None = None,
) -> list[Chunk]:
    """Split cleaned text into overlapping, sentence-aware chunks.

    Chunks are deduplicated by content hash within a document (in addition to the
    DB-level unique constraint) so identical repeated sections are stored once.
    """
    chunk_size = chunk_size or settings.rag_chunk_size
    overlap = overlap if overlap is not None else settings.rag_chunk_overlap
    if chunk_size <= 0:
        chunk_size = 1000
    overlap = max(0, min(overlap, chunk_size // 2))

    cleaned = clean_text(text)
    if not cleaned:
        return []

    segments = _segments(cleaned)
    if not segments:
        segments = [cleaned]

    chunks: list[Chunk] = []
    seen_hashes: set[str] = set()
    buf = ""
    index = 0

    def flush(buffer: str) -> str:
        nonlocal index
        content = buffer.strip()
        if not content:
            return ""
        h = _hash(content)
        if h in seen_hashes:
            return _overlap_tail(content, overlap)
        seen_hashes.add(h)
        chunks.append(
            Chunk(
                content=content,
                chunk_index=index,
                chunk_hash=h,
                token_count=max(1, estimate_tokens(content)),
            )
        )
        index += 1
        return _overlap_tail(content, overlap)

    for seg in segments:
        # A single oversized segment is hard-split so it still gets embedded.
        if len(seg) > chunk_size:
            if buf:
                flush(buf)
                buf = ""
            step = max(1, chunk_size - overlap)
            start = 0
            while start < len(seg):
                flush(seg[start : start + chunk_size])
                start += step
            continue

        candidate = f"{buf} {seg}".strip() if buf else seg
        if len(candidate) <= chunk_size:
            buf = candidate
        else:
            tail = flush(buf)
            buf = f"{tail} {seg}".strip() if tail else seg

    if buf.strip():
        flush(buf)

    return chunks
