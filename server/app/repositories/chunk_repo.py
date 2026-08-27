"""Document chunks repository — the RAG vector/keyword store.

Embeddings are stored in a pgvector ``vector(1536)`` column with an HNSW cosine
index. Similarity search uses the ``<=>`` cosine-distance operator; we expose
``score = 1 - distance`` (higher is better). **Every retrieval joins ``documents``
and filters ``documents.user_id`` so a user can never retrieve another user's
chunks** (RAG user isolation).
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

from sqlalchemy import text
from sqlalchemy.engine import Connection

from .base import format_vector, rows_to_dicts


def delete_by_document(conn: Connection, document_id: str) -> int:
    result = conn.execute(
        text("DELETE FROM document_chunks WHERE document_id = :doc"),
        {"doc": document_id},
    )
    return result.rowcount or 0


def bulk_insert(conn: Connection, document_id: str, chunks: list[dict[str, Any]]) -> int:
    """Insert chunks. Each chunk dict: content, embedding(list[float]|None),
    chunk_index(int), chunk_hash(str), token_count(int|None).

    Uses ``ON CONFLICT DO NOTHING`` so re-processing is idempotent w.r.t. the
    unique constraints. The ``sync_document_chunk_count`` trigger keeps
    ``documents.chunk_count`` accurate.
    """
    if not chunks:
        return 0

    params = []
    for c in chunks:
        embedding = c.get("embedding")
        params.append(
            {
                "document_id": document_id,
                "content": c["content"],
                "embedding": format_vector(embedding) if embedding is not None else None,
                "chunk_index": c["chunk_index"],
                "chunk_hash": c["chunk_hash"],
                "token_count": c.get("token_count"),
            }
        )

    if conn.dialect.name == "sqlite":
        stmt = text(
            """
            INSERT INTO document_chunks
                (document_id, content, embedding, chunk_index, chunk_hash, token_count)
            VALUES
                (:document_id, :content, :embedding, :chunk_index, :chunk_hash, :token_count)
            ON CONFLICT DO NOTHING
            """
        )
    else:
        stmt = text(
            """
            INSERT INTO document_chunks
                (document_id, content, embedding, chunk_index, chunk_hash, token_count)
            VALUES
                (:document_id, :content, CAST(:embedding AS vector), :chunk_index, :chunk_hash, :token_count)
            ON CONFLICT DO NOTHING
            """
        )
    result = conn.execute(stmt, params)
    return result.rowcount or 0


def vector_search(
    conn: Connection,
    *,
    user_id: str,
    query_embedding: Iterable[float],
    top_k: int,
    document_id: Optional[str] = None,
    min_score: float = 0.0,
) -> list[dict[str, Any]]:
    qvec = format_vector(query_embedding)
    doc_filter = "AND c.document_id = :document_id" if document_id else ""
    
    if conn.dialect.name == "sqlite":
        sql = text(
            f"""
            SELECT
                c.id            AS id,
                c.document_id   AS document_id,
                c.content       AS content,
                c.chunk_index   AS chunk_index,
                d.title         AS document_title,
                1.0             AS score
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE d.user_id = :user_id
              AND d.deleted_at IS NULL
              {doc_filter}
            ORDER BY c.chunk_index ASC
            LIMIT :top_k
            """
        )
    else:
        sql = text(
            f"""
            SELECT
                c.id            AS id,
                c.document_id   AS document_id,
                c.content       AS content,
                c.chunk_index   AS chunk_index,
                d.title         AS document_title,
                1 - (c.embedding <=> CAST(:qvec AS vector)) AS score
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE d.user_id = :user_id
              AND d.deleted_at IS NULL
              AND c.embedding IS NOT NULL
              {doc_filter}
            ORDER BY c.embedding <=> CAST(:qvec AS vector) ASC
            LIMIT :top_k
            """
        )
        
    params: dict[str, Any] = {"qvec": qvec, "user_id": user_id, "top_k": top_k}
    if document_id:
        params["document_id"] = document_id
    rows = rows_to_dicts(conn.execute(sql, params))
    return [r for r in rows if (r.get("score") or 0.0) >= min_score]


def keyword_search(
    conn: Connection,
    *,
    user_id: str,
    query: str,
    top_k: int,
    document_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Full-text keyword search (used to complement vector search in hybrid mode)."""
    doc_filter = "AND c.document_id = :document_id" if document_id else ""
    if conn.dialect.name == "sqlite":
        sql = text(
            f"""
            SELECT
                c.id          AS id,
                c.document_id AS document_id,
                c.content     AS content,
                c.chunk_index AS chunk_index,
                d.title       AS document_title,
                1.0           AS score
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE d.user_id = :user_id
              AND d.deleted_at IS NULL
              AND c.content LIKE :q_like
              {doc_filter}
            ORDER BY c.chunk_index ASC
            LIMIT :top_k
            """
        )
        params: dict[str, Any] = {"q_like": f"%{query}%", "user_id": user_id, "top_k": top_k}
    else:
        sql = text(
            f"""
            SELECT
                c.id          AS id,
                c.document_id AS document_id,
                c.content     AS content,
                c.chunk_index AS chunk_index,
                d.title       AS document_title,
                ts_rank(to_tsvector('english', c.content),
                        websearch_to_tsquery('english', :q)) AS score
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE d.user_id = :user_id
              AND d.deleted_at IS NULL
              AND to_tsvector('english', c.content) @@ websearch_to_tsquery('english', :q)
              {doc_filter}
            ORDER BY score DESC
            LIMIT :top_k
            """
        )
        params = {"q": query, "user_id": user_id, "top_k": top_k}
        
    if document_id:
        params["document_id"] = document_id
    return rows_to_dicts(conn.execute(sql, params))


def get_by_ids(conn: Connection, user_id: str, chunk_ids: list[str]) -> list[dict[str, Any]]:
    if not chunk_ids:
        return []
    sql = text(
        """
        SELECT c.id, c.document_id, c.content, c.chunk_index, d.title AS document_title
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE d.user_id = :user_id AND c.id = ANY(:ids)
        """
    )
    return rows_to_dicts(conn.execute(sql, {"user_id": user_id, "ids": chunk_ids}))


def count_for_document(conn: Connection, document_id: str) -> int:
    return int(
        conn.execute(
            text("SELECT count(*) FROM document_chunks WHERE document_id = :doc"),
            {"doc": document_id},
        ).scalar_one()
    )
