"""AI generation jobs repository (scene / question / grading generation)."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import insert, select, update
from sqlalchemy.engine import Connection

from app.models.tables import ai_generation_jobs as jobs
from app.models.tables import learning_sessions
from .base import first_dict, row_to_dict


def create(
    conn: Connection,
    *,
    learning_session_id: str,
    job_type: str,
    message_id: Optional[str] = None,
    status: str = "pending",
) -> dict[str, Any]:
    stmt = (
        insert(jobs)
        .values(
            learning_session_id=learning_session_id,
            job_type=job_type,
            message_id=message_id,
            status=status,
        )
        .returning(jobs)
    )
    return first_dict(conn.execute(stmt))  # type: ignore[return-value]


def get_internal(conn: Connection, job_id: str) -> Optional[dict[str, Any]]:
    return row_to_dict(conn.execute(select(jobs).where(jobs.c.id == job_id)).first())


def get_for_user(conn: Connection, job_id: str, user_id: str) -> Optional[dict[str, Any]]:
    stmt = (
        select(jobs)
        .select_from(
            jobs.join(learning_sessions, learning_sessions.c.id == jobs.c.learning_session_id)
        )
        .where(jobs.c.id == job_id, learning_sessions.c.user_id == user_id)
    )
    return row_to_dict(conn.execute(stmt).first())


def update_status(
    conn: Connection,
    job_id: str,
    *,
    status: Optional[str] = None,
    input_token_count: Optional[int] = None,
    output_token_count: Optional[int] = None,
) -> Optional[dict[str, Any]]:
    values: dict[str, Any] = {}
    if status is not None:
        values["status"] = status
    if input_token_count is not None:
        values["input_token_count"] = input_token_count
    if output_token_count is not None:
        values["output_token_count"] = output_token_count
    if not values:
        return get_internal(conn, job_id)
    stmt = update(jobs).where(jobs.c.id == job_id).values(**values).returning(jobs)
    return first_dict(conn.execute(stmt))
