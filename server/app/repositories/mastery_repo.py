"""Mastery / Understanding Map read models.

Aggregates ``concept_scores`` across a user's assessments. All queries filter on
``documents.user_id`` / ``learning_sessions.user_id`` for isolation.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection

from .base import rows_to_dicts


def summary_by_document(conn: Connection, user_id: str) -> list[dict[str, Any]]:
    """Per-document average mastery (0-100). Subject == document title."""
    sql = text(
        """
        SELECT
            d.id            AS document_id,
            d.title         AS subject,
            AVG(cs.mastery) AS mastery
        FROM documents d
        JOIN learning_sessions ls
            ON ls.document_id = d.id AND ls.deleted_at IS NULL
        JOIN assessment_sessions a
            ON a.learning_session_id = ls.id
        JOIN concept_scores cs
            ON cs.assessment_session_id = a.id
        WHERE d.user_id = :user_id AND d.deleted_at IS NULL
        GROUP BY d.id, d.title
        ORDER BY d.title ASC
        """
    )
    return rows_to_dicts(conn.execute(sql, {"user_id": user_id}))


def concepts_for_topic(
    conn: Connection, learning_session_id: str, user_id: str
) -> list[dict[str, Any]]:
    """Concept scores for a single topic (learning_session), ordered."""
    sql = text(
        """
        SELECT
            cs.id           AS id,
            cs.concept_name AS concept_name,
            cs.score        AS score,
            cs.mastery      AS mastery
        FROM concept_scores cs
        JOIN assessment_sessions a ON a.id = cs.assessment_session_id
        JOIN learning_sessions ls ON ls.id = a.learning_session_id
        WHERE ls.id = :ls AND ls.user_id = :user_id
        ORDER BY cs.created_at ASC
        """
    )
    return rows_to_dicts(conn.execute(sql, {"ls": learning_session_id, "user_id": user_id}))
