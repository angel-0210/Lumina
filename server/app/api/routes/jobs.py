"""Jobs route: poll the status of enqueued background work.

The in-process job manager is the source of truth for live status, keyed by the
``job_id`` returned at enqueue time (HTTP 202). Ownership is enforced by the
manager — a caller can never observe another user's job.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.core.responses import success
from app.services import job_service

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}")
def get_status(job_id: str, principal: CurrentUser):
    """Return the current status/progress/result of a background job."""
    return success(job_service.get_status(principal, job_id))
