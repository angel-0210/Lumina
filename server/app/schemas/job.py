"""Async job DTOs.

Long-running operations (document ingestion, scene/question/grading generation,
video generation) return a job reference immediately (HTTP 202) and are polled
via a status endpoint.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from .common import Schema

# job lifecycle states mirror the DB ``job_status`` enum plus a synthetic
# "queued" alias surfaced to clients as "pending".
JobStatusLiteral = str  # "pending" | "processing" | "completed" | "failed"


class JobRef(Schema):
    """Returned with HTTP 202 when work is enqueued."""

    job_id: str
    status: JobStatusLiteral = "pending"
    kind: Optional[str] = Field(default=None, description="Job category, e.g. 'document_processing'")


class JobStatus(Schema):
    """Full job status for polling."""

    job_id: str
    kind: str
    status: JobStatusLiteral
    progress_pct: int = 0
    error_message: Optional[str] = None
    result: Optional[Any] = Field(
        default=None,
        description="Job-specific result reference when completed (e.g. document_id, lesson_id, media url).",
    )
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
