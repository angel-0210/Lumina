"""Document processing jobs repository."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import insert, select, update
from sqlalchemy.engine import Connection

from app.models.tables import document_processing_jobs as jobs
from app.models.tables import documents
from .base import first_dict, row_to_dict


def create(conn: Connection, *, document_id: str, status: str = "pending") -> dict[str, Any]:
    stmt = (
        insert(jobs)
        .values(document_id=document_id, status=status, progress_pct=0)
        .returning(jobs)
    )
    return first_dict(conn.execute(stmt))  # type: ignore[return-value]


def get_internal(conn: Connection, job_id: str) -> Optional[dict[str, Any]]:
    """No ownership filter — worker use only."""
    return row_to_dict(conn.execute(select(jobs).where(jobs.c.id == job_id)).first())


def get_for_user(conn: Connection, job_id: str, user_id: str) -> Optional[dict[str, Any]]:
    """Ownership-enforced fetch via the parent document."""
    stmt = (
        select(jobs)
        .select_from(jobs.join(documents, documents.c.id == jobs.c.document_id))
        .where(jobs.c.id == job_id, documents.c.user_id == user_id)
    )
    return row_to_dict(conn.execute(stmt).first())


def latest_for_document(conn: Connection, document_id: str, user_id: str) -> Optional[dict[str, Any]]:
    stmt = (
        select(jobs)
        .select_from(jobs.join(documents, documents.c.id == jobs.c.document_id))
        .where(jobs.c.document_id == document_id, documents.c.user_id == user_id)
        .order_by(jobs.c.created_at.desc())
        .limit(1)
    )
    return row_to_dict(conn.execute(stmt).first())


def update_progress(
    conn: Connection,
    job_id: str,
    *,
    status: Optional[str] = None,
    progress_pct: Optional[int] = None,
    error_message: Optional[str] = None,
    increment_retry: bool = False,
) -> Optional[dict[str, Any]]:
    values: dict[str, Any] = {}
    if status is not None:
        values["status"] = status
    if progress_pct is not None:
        values["progress_pct"] = max(0, min(100, progress_pct))
    if error_message is not None:
        values["error_message"] = error_message
    if increment_retry:
        values["retry_count"] = jobs.c.retry_count + 1
    if not values:
        return get_internal(conn, job_id)
    stmt = update(jobs).where(jobs.c.id == job_id).values(**values).returning(jobs)
    return first_dict(conn.execute(stmt))
