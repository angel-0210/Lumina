"""Learning sessions & tutorial scenes repository.

A ``learning_session`` is the backing entity for both a "topic" and a "lesson".
``tutorial_scenes`` are its ordered scenes.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy import func, insert, select, text, update
from sqlalchemy.engine import Connection

from app.models.tables import documents, learning_sessions, tutorial_scenes
from .base import first_dict, row_to_dict, rows_to_dicts


# --------------------------------------------------------------------------- #
# Sessions
# --------------------------------------------------------------------------- #
def create_session(
    conn: Connection,
    *,
    user_id: str,
    document_id: str,
    title: Optional[str] = None,
    status: str = "active",
) -> dict[str, Any]:
    stmt = (
        insert(learning_sessions)
        .values(user_id=user_id, document_id=document_id, title=title, status=status)
        .returning(learning_sessions)
    )
    return first_dict(conn.execute(stmt))  # type: ignore[return-value]


def get_session(conn: Connection, session_id: str, user_id: str) -> Optional[dict[str, Any]]:
    stmt = select(learning_sessions).where(
        learning_sessions.c.id == session_id,
        learning_sessions.c.user_id == user_id,
        learning_sessions.c.deleted_at.is_(None),
    )
    return row_to_dict(conn.execute(stmt).first())


def get_session_internal(conn: Connection, session_id: str) -> Optional[dict[str, Any]]:
    stmt = select(learning_sessions).where(learning_sessions.c.id == session_id)
    return row_to_dict(conn.execute(stmt).first())


def get_session_with_document(
    conn: Connection, session_id: str, user_id: str
) -> Optional[dict[str, Any]]:
    """Session joined with its document's title (ownership enforced)."""
    stmt = (
        select(
            learning_sessions,
            documents.c.title.label("document_title"),
        )
        .select_from(
            learning_sessions.join(documents, documents.c.id == learning_sessions.c.document_id)
        )
        .where(
            learning_sessions.c.id == session_id,
            learning_sessions.c.user_id == user_id,
            learning_sessions.c.deleted_at.is_(None),
        )
    )
    return row_to_dict(conn.execute(stmt).first())


def list_sessions(
    conn: Connection,
    user_id: str,
    *,
    limit: int,
    offset: int,
    document_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    conditions = [
        learning_sessions.c.user_id == user_id,
        learning_sessions.c.deleted_at.is_(None),
    ]
    if document_id:
        conditions.append(learning_sessions.c.document_id == document_id)
    stmt = (
        select(
            learning_sessions,
            documents.c.title.label("document_title"),
        )
        .select_from(
            learning_sessions.join(documents, documents.c.id == learning_sessions.c.document_id)
        )
        .where(*conditions)
        .order_by(learning_sessions.c.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return rows_to_dicts(conn.execute(stmt))


def count_sessions(
    conn: Connection, user_id: str, *, document_id: Optional[str] = None
) -> int:
    conditions = [
        learning_sessions.c.user_id == user_id,
        learning_sessions.c.deleted_at.is_(None),
    ]
    if document_id:
        conditions.append(learning_sessions.c.document_id == document_id)
    stmt = select(func.count()).select_from(learning_sessions).where(*conditions)
    return int(conn.execute(stmt).scalar_one())


def set_title(conn: Connection, session_id: str, title: str) -> None:
    conn.execute(
        update(learning_sessions)
        .where(learning_sessions.c.id == session_id)
        .values(title=title)
    )


def update_status(conn: Connection, session_id: str, status: str) -> None:
    conn.execute(
        update(learning_sessions)
        .where(learning_sessions.c.id == session_id)
        .values(status=status)
    )


def soft_delete_session(conn: Connection, session_id: str, user_id: str) -> bool:
    stmt = (
        update(learning_sessions)
        .where(
            learning_sessions.c.id == session_id,
            learning_sessions.c.user_id == user_id,
            learning_sessions.c.deleted_at.is_(None),
        )
        .values(deleted_at=func.now())
        .returning(learning_sessions.c.id)
    )
    return conn.execute(stmt).first() is not None


# --------------------------------------------------------------------------- #
# Scenes
# --------------------------------------------------------------------------- #
def replace_scenes(conn: Connection, session_id: str, scenes: list[dict[str, Any]]) -> int:
    """Delete existing scenes for a session and insert the provided ordered set."""
    conn.execute(
        tutorial_scenes.delete().where(tutorial_scenes.c.learning_session_id == session_id)
    )
    if not scenes:
        return 0
    rows = [
        {
            "learning_session_id": session_id,
            "scene_index": s["scene_index"],
            "title": s["title"],
            "narration": s["narration"],
            "visual_type": s.get("visual_type", "text"),
            "visual_data": s.get("visual_data") or {},
        }
        for s in scenes
    ]
    # Use text() to bind JSONB explicitly.
    stmt = text(
        """
        INSERT INTO tutorial_scenes
            (learning_session_id, scene_index, title, narration, visual_type, visual_data)
        VALUES
            (:learning_session_id, :scene_index, :title, :narration,
             CAST(:visual_type AS visual_type), CAST(:visual_data AS jsonb))
        """
    )
    for r in rows:
        r["visual_data"] = json.dumps(r["visual_data"])
    result = conn.execute(stmt, rows)
    return result.rowcount or 0


def list_scenes(conn: Connection, session_id: str) -> list[dict[str, Any]]:
    stmt = (
        select(tutorial_scenes)
        .where(tutorial_scenes.c.learning_session_id == session_id)
        .order_by(tutorial_scenes.c.scene_index.asc())
    )
    return rows_to_dicts(conn.execute(stmt))


def count_scenes(conn: Connection, session_id: str) -> int:
    stmt = (
        select(func.count())
        .select_from(tutorial_scenes)
        .where(tutorial_scenes.c.learning_session_id == session_id)
    )
    return int(conn.execute(stmt).scalar_one())


def scene_counts(conn: Connection, session_ids: list[str]) -> dict[str, int]:
    """Map of learning_session_id -> scene count for the given sessions.

    Single grouped query so topic/lesson listings avoid an N+1 count per row.
    """
    if not session_ids:
        return {}
    stmt = (
        select(
            tutorial_scenes.c.learning_session_id,
            func.count().label("n"),
        )
        .where(tutorial_scenes.c.learning_session_id.in_(session_ids))
        .group_by(tutorial_scenes.c.learning_session_id)
    )
    return {str(row.learning_session_id): int(row.n) for row in conn.execute(stmt)}
