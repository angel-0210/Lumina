"""Assessment sessions & concept scores repository (Concept Crucible)."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection

from app.models.tables import assessment_sessions, concept_scores
from .base import first_dict, row_to_dict, rows_to_dicts


def create_or_get(
    conn: Connection, *, learning_session_id: str, user_id: str, level: str = "Curious"
) -> dict[str, Any]:
    """Create an assessment for a learning session, or return the existing one.

    ``assessment_sessions.learning_session_id`` is UNIQUE.
    """
    stmt = (
        pg_insert(assessment_sessions)
        .values(
            learning_session_id=learning_session_id,
            user_id=user_id,
            status="started",
            level=level,
        )
        .on_conflict_do_nothing(index_elements=[assessment_sessions.c.learning_session_id])
        .returning(assessment_sessions)
    )
    row = first_dict(conn.execute(stmt))
    if row is not None:
        return row
    return get_by_learning_session(conn, learning_session_id, user_id)  # type: ignore[return-value]


def get(conn: Connection, assessment_id: str, user_id: str) -> Optional[dict[str, Any]]:
    stmt = select(assessment_sessions).where(
        assessment_sessions.c.id == assessment_id,
        assessment_sessions.c.user_id == user_id,
    )
    return row_to_dict(conn.execute(stmt).first())


def get_by_learning_session(
    conn: Connection, learning_session_id: str, user_id: str
) -> Optional[dict[str, Any]]:
    stmt = select(assessment_sessions).where(
        assessment_sessions.c.learning_session_id == learning_session_id,
        assessment_sessions.c.user_id == user_id,
    )
    return row_to_dict(conn.execute(stmt).first())


def list_for_user(
    conn: Connection, user_id: str, *, limit: int, offset: int
) -> list[dict[str, Any]]:
    stmt = (
        select(assessment_sessions)
        .where(assessment_sessions.c.user_id == user_id)
        .order_by(assessment_sessions.c.started_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return rows_to_dicts(conn.execute(stmt))


def count_for_user(conn: Connection, user_id: str) -> int:
    stmt = (
        select(func.count())
        .select_from(assessment_sessions)
        .where(assessment_sessions.c.user_id == user_id)
    )
    return int(conn.execute(stmt).scalar_one())


def complete(conn: Connection, assessment_id: str) -> Optional[dict[str, Any]]:
    stmt = (
        update(assessment_sessions)
        .where(assessment_sessions.c.id == assessment_id)
        .values(status="completed", completed_at=func.now())
        .returning(assessment_sessions)
    )
    return first_dict(conn.execute(stmt))


def reopen(
    conn: Connection, assessment_id: str, *, level: Optional[str] = None
) -> Optional[dict[str, Any]]:
    """Reset an assessment to a fresh 'started' state (used when a Crucible is
    restarted). Optionally updates the chosen difficulty ``level``."""
    values: dict[str, Any] = {"status": "started", "completed_at": None}
    if level is not None:
        values["level"] = level
    stmt = (
        update(assessment_sessions)
        .where(assessment_sessions.c.id == assessment_id)
        .values(**values)
        .returning(assessment_sessions)
    )
    return first_dict(conn.execute(stmt))


def clear_scores(conn: Connection, assessment_session_id: str) -> int:
    """Delete all concept scores for an assessment (used on restart)."""
    result = conn.execute(
        concept_scores.delete().where(
            concept_scores.c.assessment_session_id == assessment_session_id
        )
    )
    return result.rowcount or 0


def upsert_scores(
    conn: Connection, assessment_session_id: str, scores: list[dict[str, Any]]
) -> int:
    """Insert/update concept scores. Each item: concept_name, score, mastery, evidence."""
    if not scores:
        return 0
    count = 0
    for s in scores:
        stmt = (
            pg_insert(concept_scores)
            .values(
                assessment_session_id=assessment_session_id,
                concept_name=s["concept_name"],
                score=int(s["score"]),
                mastery=int(s["mastery"]),
                evidence=s.get("evidence"),
            )
            .on_conflict_do_update(
                index_elements=[
                    concept_scores.c.assessment_session_id,
                    concept_scores.c.concept_name,
                ],
                set_={
                    "score": int(s["score"]),
                    "mastery": int(s["mastery"]),
                    "evidence": s.get("evidence"),
                },
            )
        )
        conn.execute(stmt)
        count += 1
    return count


def list_scores(conn: Connection, assessment_session_id: str) -> list[dict[str, Any]]:
    stmt = (
        select(concept_scores)
        .where(concept_scores.c.assessment_session_id == assessment_session_id)
        .order_by(concept_scores.c.created_at.asc())
    )
    return rows_to_dicts(conn.execute(stmt))


def average_mastery(conn: Connection, assessment_session_id: str) -> float:
    stmt = select(func.avg(concept_scores.c.mastery)).where(
        concept_scores.c.assessment_session_id == assessment_session_id
    )
    val = conn.execute(stmt).scalar()
    return float(val) if val is not None else 0.0


def average_score(conn: Connection, assessment_session_id: str) -> float:
    stmt = select(func.avg(concept_scores.c.score)).where(
        concept_scores.c.assessment_session_id == assessment_session_id
    )
    val = conn.execute(stmt).scalar()
    return float(val) if val is not None else 0.0
