"""Documents repository. All user-facing reads/writes enforce ownership."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func, insert, select, update
from sqlalchemy.engine import Connection

from app.models.tables import documents, learning_sessions
from .base import first_dict, row_to_dict, rows_to_dicts


def create(
    conn: Connection,
    *,
    user_id: str,
    title: str,
    file_key: str,
    file_type: str,
    file_size: int,
    status: str = "pending",
    file_public_id: Optional[str] = None,
) -> dict[str, Any]:
    stmt = (
        insert(documents)
        .values(
            user_id=user_id,
            title=title,
            file_key=file_key,
            file_public_id=file_public_id,
            file_type=file_type,
            file_size=file_size,
            status=status,
        )
        .returning(documents)
    )
    return first_dict(conn.execute(stmt))  # type: ignore[return-value]


def get(conn: Connection, document_id: str, user_id: str) -> Optional[dict[str, Any]]:
    """Ownership-enforced fetch."""
    stmt = select(documents).where(
        documents.c.id == document_id,
        documents.c.user_id == user_id,
        documents.c.deleted_at.is_(None),
    )
    return row_to_dict(conn.execute(stmt).first())


def get_internal(conn: Connection, document_id: str) -> Optional[dict[str, Any]]:
    """No ownership filter — for background workers only. Never expose directly."""
    stmt = select(documents).where(documents.c.id == document_id)
    return row_to_dict(conn.execute(stmt).first())


def list_for_user(
    conn: Connection,
    user_id: str,
    *,
    limit: int,
    offset: int,
) -> list[dict[str, Any]]:
    stmt = (
        select(documents)
        .where(documents.c.user_id == user_id, documents.c.deleted_at.is_(None))
        .order_by(documents.c.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return rows_to_dicts(conn.execute(stmt))


def count_for_user(conn: Connection, user_id: str) -> int:
    stmt = (
        select(func.count())
        .select_from(documents)
        .where(documents.c.user_id == user_id, documents.c.deleted_at.is_(None))
    )
    return int(conn.execute(stmt).scalar_one())


def recent_for_user(conn: Connection, user_id: str, limit: int = 5) -> list[dict[str, Any]]:
    return list_for_user(conn, user_id, limit=limit, offset=0)


def topic_count(conn: Connection, document_id: str) -> int:
    """Number of study units (learning_sessions) derived from the document."""
    stmt = (
        select(func.count())
        .select_from(learning_sessions)
        .where(
            learning_sessions.c.document_id == document_id,
            learning_sessions.c.deleted_at.is_(None),
        )
    )
    return int(conn.execute(stmt).scalar_one())


def topic_counts(conn: Connection, user_id: str) -> dict[str, int]:
    """Map of document_id -> study-unit count for all the user's documents.

    Single grouped query so document listings avoid an N+1 count per row.
    """
    stmt = (
        select(
            learning_sessions.c.document_id,
            func.count().label("n"),
        )
        .select_from(
            learning_sessions.join(documents, documents.c.id == learning_sessions.c.document_id)
        )
        .where(
            documents.c.user_id == user_id,
            learning_sessions.c.deleted_at.is_(None),
            documents.c.deleted_at.is_(None),
        )
        .group_by(learning_sessions.c.document_id)
    )
    return {str(row.document_id): int(row.n) for row in conn.execute(stmt)}


def update_status(
    conn: Connection,
    document_id: str,
    *,
    status: str,
    chunk_count: Optional[int] = None,
) -> Optional[dict[str, Any]]:
    """Worker-only status transition (no ownership filter).

    Optionally sets ``chunk_count`` in the same update (used when ingestion
    finishes and the number of embedded chunks is known).
    """
    values: dict[str, Any] = {"status": status}
    if chunk_count is not None:
        values["chunk_count"] = max(0, int(chunk_count))
    stmt = (
        update(documents)
        .where(documents.c.id == document_id)
        .values(**values)
        .returning(documents)
    )
    return first_dict(conn.execute(stmt))


def soft_delete(conn: Connection, document_id: str, user_id: str) -> bool:
    stmt = (
        update(documents)
        .where(
            documents.c.id == document_id,
            documents.c.user_id == user_id,
            documents.c.deleted_at.is_(None),
        )
        .values(deleted_at=func.now())
        .returning(documents.c.id)
    )
    return conn.execute(stmt).first() is not None


def get_file_info(
    conn: Connection, document_id: str, user_id: str
) -> Optional[dict[str, Any]]:
    """Return file_key and file_public_id for the given document (ownership-checked).

    Used by the delete flow to clean up the Cloudinary asset before (or after)
    soft-deleting the DB row.
    """
    stmt = (
        select(documents.c.id, documents.c.file_key, documents.c.file_public_id)
        .where(
            documents.c.id == document_id,
            documents.c.user_id == user_id,
            documents.c.deleted_at.is_(None),
        )
    )
    return row_to_dict(conn.execute(stmt).first())
