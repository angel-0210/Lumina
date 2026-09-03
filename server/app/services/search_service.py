"""Search service — unified, user-isolated search across documents, topics, concepts, and chunks."""

from __future__ import annotations

from typing import Any, Optional
from sqlalchemy import select, text
from sqlalchemy.engine import Connection

from app.models.tables import documents, topics, concepts
from app.repositories import chunk_repo
from app.repositories.base import rows_to_dicts


def search_all(
    conn: Connection,
    *,
    user_id: str,
    query: str,
    limit: int = 20,
) -> dict[str, Any]:
    """Search user's documents, topics, concepts, and chunks."""
    query = (query or "").strip()
    if not query:
        return {
            "documents": [],
            "topics": [],
            "concepts": [],
            "chunks": [],
            "total_matches": 0,
        }

    like_q = f"%{query}%"

    # 1. Search Documents
    doc_stmt = (
        select(documents.c.id, documents.c.title, documents.c.file_type, documents.c.status, documents.c.created_at)
        .where(
            documents.c.user_id == user_id,
            documents.c.deleted_at.is_(None),
            documents.c.title.ilike(like_q),
        )
        .order_by(documents.c.created_at.desc())
        .limit(limit)
    )
    doc_rows = rows_to_dicts(conn.execute(doc_stmt))

    # 2. Search Topics
    topic_stmt = (
        select(
            topics.c.id,
            topics.c.title,
            topics.c.description,
            topics.c.document_id,
            documents.c.title.label("document_title"),
        )
        .select_from(topics.join(documents, documents.c.id == topics.c.document_id))
        .where(
            topics.c.user_id == user_id,
            topics.c.deleted_at.is_(None),
            documents.c.deleted_at.is_(None),
            (topics.c.title.ilike(like_q) | topics.c.description.ilike(like_q)),
        )
        .order_by(topics.c.created_at.desc())
        .limit(limit)
    )
    topic_rows = rows_to_dicts(conn.execute(topic_stmt))

    # 3. Search Concepts
    concept_stmt = (
        select(
            concepts.c.id,
            concepts.c.name,
            concepts.c.description,
            concepts.c.topic_id,
            concepts.c.document_id,
        )
        .select_from(concepts.join(documents, documents.c.id == concepts.c.document_id))
        .where(
            concepts.c.user_id == user_id,
            concepts.c.deleted_at.is_(None),
            documents.c.deleted_at.is_(None),
            (concepts.c.name.ilike(like_q) | concepts.c.description.ilike(like_q)),
        )
        .order_by(concepts.c.created_at.desc())
        .limit(limit)
    )
    concept_rows = rows_to_dicts(conn.execute(concept_stmt))

    # 4. Search Chunks (Keyword / Fulltext match)
    chunk_rows = []
    try:
        raw_chunks = chunk_repo.keyword_search(conn, user_id=user_id, query=query, top_k=limit)
        chunk_rows = [
            {
                "id": r["id"],
                "document_id": r["document_id"],
                "document_title": r.get("document_title") or "Document",
                "content": r["content"][:200] + ("..." if len(r["content"]) > 200 else ""),
                "chunk_index": r["chunk_index"],
                "score": r.get("score", 1.0),
            }
            for r in raw_chunks
        ]
    except Exception:
        chunk_rows = []

    total_matches = len(doc_rows) + len(topic_rows) + len(concept_rows) + len(chunk_rows)

    return {
        "documents": doc_rows,
        "topics": topic_rows,
        "concepts": concept_rows,
        "chunks": chunk_rows,
        "total_matches": total_matches,
    }
