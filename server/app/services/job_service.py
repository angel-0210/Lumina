"""Job service — status polling for background work.

The in-process :class:`JobManager` is the source of truth for a job's live
status, keyed by the ``job_id`` handed back at enqueue time (HTTP 202). Ownership
is enforced by the manager: a user can never observe another user's job.

Durability note: document-ingestion and AI-generation jobs also mirror their
state into their own DB tables (keyed by their own ids, not the manager id), so
after a process restart the *document* processing status is still available via
the documents API even though the manager's in-memory record is gone. Purely
ephemeral media jobs live only in the manager for ``jobs_retention_minutes``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.core.exceptions import NotFoundError
from app.core.security import AuthPrincipal
from app.jobs.manager import job_manager
from app.schemas.job import JobStatus


def _epoch_to_dt(value: Optional[float]) -> Optional[datetime]:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return None


def get_status(principal: AuthPrincipal, job_id: str) -> JobStatus:
    rec = job_manager.get(job_id, user_id=principal.id)
    if rec is None:
        raise NotFoundError("Job not found or no longer available.")
    return JobStatus(
        job_id=rec.job_id,
        kind=rec.kind,
        status=rec.state.value,
        progress_pct=rec.progress_pct,
        error_message=rec.error_message,
        result=rec.result or None,
        created_at=_epoch_to_dt(rec.created_at),
        updated_at=_epoch_to_dt(rec.updated_at),
    )
