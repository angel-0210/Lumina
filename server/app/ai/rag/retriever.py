"""Retrieval — turn a natural-language query into ranked, user-scoped chunks.

Flow (synchronous):
    query -> embed_query (Gemini) -> vector_search (pgvector cosine)
          -> optional keyword_search -> reciprocal-rank fusion -> top-k

**User isolation** is enforced by the repository layer: every search passes the
caller's ``user_id`` and joins ``documents`` so no cross-user chunk is reachable.
This module never widens that scope.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.engine import Connection

from app.ai import gemini_provider
from app.ai.base import RetrievedChunk
from app.core.config import settings
from app.core.logging import get_logger
from app.repositories import chunk_repo

logger = get_logger(__name__)

# Reciprocal-rank-fusion constant; 60 is the value from the original RRF paper.
_RRF_K = 60


def _to_retrieved(row: dict, method: str) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=str(row["id"]),
        document_id=str(row["document_id"]),
        document_title=row.get("document_title") or "Document",
        content=row.get("content") or "",
        chunk_index=int(row.get("chunk_index") or 0),
        score=float(row.get("score") or 0.0),
        method=method,
    )


def _reciprocal_rank_fusion(
    vector_rows: list[dict],
    keyword_rows: list[dict],
    top_k: int,
) -> list[RetrievedChunk]:
    """Fuse two ranked lists by reciprocal rank, preferring items in both."""
    scores: dict[str, float] = {}
    payload: dict[str, dict] = {}
    methods: dict[str, set[str]] = {}

    for ranked, label in ((vector_rows, "vector"), (keyword_rows, "keyword")):
        for rank, row in enumerate(ranked):
            cid = str(row["id"])
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (_RRF_K + rank + 1)
            payload.setdefault(cid, row)
            methods.setdefault(cid, set()).add(label)

    ordered = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    results: list[RetrievedChunk] = []
    for cid, fused in ordered[:top_k]:
        row = payload[cid]
        method = "hybrid" if len(methods[cid]) > 1 else next(iter(methods[cid]))
        rc = _to_retrieved(row, method)
        rc.score = round(fused, 6)  # expose fused score for transparency
        results.append(rc)
    return results


def retrieve(
    conn: Connection,
    *,
    user_id: str,
    query: str,
    top_k: Optional[int] = None,
    document_id: Optional[str] = None,
    min_score: Optional[float] = None,
    hybrid: bool = True,
) -> list[RetrievedChunk]:
    """Retrieve the most relevant chunks for ``query`` within the user's documents.

    Returns an empty list if the query embeds to nothing (e.g. AI unavailable is
    surfaced upstream) or no chunk clears ``min_score``.
    """
    query = (query or "").strip()
    if not query:
        return []

    top_k = top_k or settings.rag_top_k
    min_score = settings.rag_min_score if min_score is None else min_score

    # Vector search (primary signal).
    embedding = gemini_provider.embed_query(query)
    vector_rows: list[dict] = []
    if embedding:
        vector_rows = chunk_repo.vector_search(
            conn,
            user_id=user_id,
            query_embedding=embedding,
            top_k=top_k,
            document_id=document_id,
            min_score=min_score,
        )

    if not hybrid:
        return [_to_retrieved(r, "vector") for r in vector_rows]

    # Keyword search (complementary lexical signal); best-effort.
    try:
        keyword_rows = chunk_repo.keyword_search(
            conn,
            user_id=user_id,
            query=query,
            top_k=top_k,
            document_id=document_id,
        )
    except Exception as exc:  # tsquery can reject odd input; never fail retrieval
        logger.warning("keyword search failed, using vector only: %s", exc)
        keyword_rows = []

    if not keyword_rows:
        return [_to_retrieved(r, "vector") for r in vector_rows]
    if not vector_rows:
        return [_to_retrieved(r, "keyword") for r in keyword_rows]

    return _reciprocal_rank_fusion(vector_rows, keyword_rows, top_k)
