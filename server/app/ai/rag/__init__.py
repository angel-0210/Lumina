"""RAG pipeline package.

The end-to-end flow the product requires:

    upload -> storage -> extract -> clean -> chunk -> embed -> vector store
           -> retrieve -> rank/fuse -> assemble context -> Gemini -> grounded
           answer with citations

Modules:
    extractor.py  -> bytes -> plain text (PDF/txt/markdown)
    chunker.py    -> clean + sentence-aware chunking with overlap + content hash
    ingestion.py  -> download -> extract -> chunk -> embed -> store (worker path)
    retriever.py  -> query -> embed -> vector + keyword -> RRF -> ranked chunks
    context.py    -> ranked chunks -> numbered sources + citation payloads
"""

from __future__ import annotations

from .chunker import Chunk, chunk_text, clean_text
from .context import AssembledContext, assemble_context, source_labels
from .extractor import ExtractedDocument, ExtractionError, extract_text
from .ingestion import (
    IngestionError,
    IngestionResult,
    PreparedChunks,
    ingest_document,
    persist_chunks,
    prepare_chunks,
)
from .retriever import retrieve

__all__ = [
    "Chunk",
    "chunk_text",
    "clean_text",
    "AssembledContext",
    "assemble_context",
    "source_labels",
    "ExtractedDocument",
    "ExtractionError",
    "extract_text",
    "IngestionError",
    "IngestionResult",
    "PreparedChunks",
    "ingest_document",
    "persist_chunks",
    "prepare_chunks",
    "retrieve",
]
