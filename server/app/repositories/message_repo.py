"""Session messages & message retrievals repository.

Chat/dialogue turns live in ``session_messages``; the chunks retrieved to ground
an assistant answer are recorded in ``message_retrievals`` (RAG provenance).
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func, insert, select, text
from sqlalchemy.engine import Connection

from app.models.tables import (
    document_chunks,
    documents,
    learning_sessions,
    message_retrievals,
    session_messages,
)
from .base import first_dict, rows_to_dicts


def add_message(
    conn: Connection,
    *,
    learning_session_id: str,
    role: str,
    phase: str,
    content: str,
    token_count: Optional[int] = None,
) -> dict[str, Any]:
    stmt = (
        insert(session_messages)
        .values(
            learning_session_id=learning_session_id,
            role=role,
            phase=phase,
            content=content,
            token_count=token_count,
        )
        .returning(session_messages)
    )
    return first_dict(conn.execute(stmt))  # type: ignore[return-value]


def list_messages(
    conn: Connection,
    learning_session_id: str,
    user_id: str,
    *,
    limit: int,
    offset: int,
    phases: Optional[list[str]] = None,
    ascending: bool = True,
) -> list[dict[str, Any]]:
    """Ownership-enforced message listing (joins learning_sessions.user_id)."""
    conditions = [
        session_messages.c.learning_session_id == learning_session_id,
        learning_sessions.c.user_id == user_id,
        learning_sessions.c.deleted_at.is_(None),
    ]
    if phases:
        conditions.append(session_messages.c.phase.in_(phases))
    order = (
        session_messages.c.created_at.asc()
        if ascending
        else session_messages.c.created_at.desc()
    )
    stmt = (
        select(session_messages)
        .select_from(
            session_messages.join(
                learning_sessions,
                learning_sessions.c.id == session_messages.c.learning_session_id,
            )
        )
        .where(*conditions)
        .order_by(order)
        .limit(limit)
        .offset(offset)
    )
    return rows_to_dicts(conn.execute(stmt))


def count_messages(
    conn: Connection,
    learning_session_id: str,
    user_id: str,
    *,
    phases: Optional[list[str]] = None,
) -> int:
    conditions = [
        session_messages.c.learning_session_id == learning_session_id,
        learning_sessions.c.user_id == user_id,
    ]
    if phases:
        conditions.append(session_messages.c.phase.in_(phases))
    stmt = (
        select(func.count())
        .select_from(
            session_messages.join(
                learning_sessions,
                learning_sessions.c.id == session_messages.c.learning_session_id,
            )
        )
        .where(*conditions)
    )
    return int(conn.execute(stmt).scalar_one())


def recent_messages(
    conn: Connection, learning_session_id: str, *, limit: int
) -> list[dict[str, Any]]:
    """Most recent messages (no ownership filter — caller must have verified it)."""
    stmt = (
        select(session_messages)
        .where(session_messages.c.learning_session_id == learning_session_id)
        .order_by(session_messages.c.created_at.desc())
        .limit(limit)
    )
    rows = rows_to_dicts(conn.execute(stmt))
    return list(reversed(rows))


def delete_for_session(conn: Connection, learning_session_id: str) -> int:
    """Delete all messages for a learning session.

    Used when a Concept Crucible is restarted for a topic (a topic's
    learning_session only ever holds Crucible dialogue, so this does not touch
    Explore conversations, which live in their own sessions). Crucible messages
    never have ``message_retrievals`` rows, so no dependent rows are orphaned.
    """
    result = conn.execute(
        session_messages.delete().where(
            session_messages.c.learning_session_id == learning_session_id
        )
    )
    return result.rowcount or 0


def add_retrievals(
    conn: Connection, message_id: str, retrievals: list[dict[str, Any]]
) -> int:
    """Record which chunks grounded a message. Each item: chunk_id, rank, score, method."""
    if not retrievals:
        return 0
    rows = [
        {
            "message_id": message_id,
            "chunk_id": r["chunk_id"],
            "rank": r["rank"],
            "score": r.get("score"),
            "retrieval_method": r.get("retrieval_method", "vector"),
        }
        for r in retrievals
    ]
    stmt = text(
        """
        INSERT INTO message_retrievals
            (message_id, chunk_id, rank, score, retrieval_method)
        VALUES
            (:message_id, :chunk_id, :rank, :score, CAST(:retrieval_method AS retrieval_method))
        ON CONFLICT DO NOTHING
        """
    )
    result = conn.execute(stmt, rows)
    return result.rowcount or 0


def list_retrievals_for_message(
    conn: Connection, message_id: str, user_id: str
) -> list[dict[str, Any]]:
    """Retrievals for a message with chunk + document context (ownership enforced)."""
    stmt = (
        select(
            message_retrievals.c.id,
            message_retrievals.c.rank,
            message_retrievals.c.score,
            message_retrievals.c.retrieval_method,
            document_chunks.c.id.label("chunk_id"),
            document_chunks.c.content.label("content"),
            document_chunks.c.chunk_index.label("chunk_index"),
            documents.c.id.label("document_id"),
            documents.c.title.label("document_title"),
        )
        .select_from(
            message_retrievals.join(
                document_chunks, document_chunks.c.id == message_retrievals.c.chunk_id
            ).join(documents, documents.c.id == document_chunks.c.document_id)
        )
        .where(message_retrievals.c.message_id == message_id, documents.c.user_id == user_id)
        .order_by(message_retrievals.c.rank.asc())
    )
    return rows_to_dicts(conn.execute(stmt))
