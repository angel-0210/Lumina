"""Background job infrastructure.

Long-running work (document ingestion, AI scene generation, VEO video) must not
block HTTP requests. Routes enqueue a job here and immediately return ``202`` with
a ``job_id``; the client polls job status.

Design:
    * A process-wide :class:`ThreadPoolExecutor` runs job callables. FastAPI's
      route handlers are synchronous (threadpool-backed), and jobs run on their
      own pool, so neither blocks the event loop.
    * An in-memory registry tracks status/progress/result for polling. Jobs that
      also have a DB home (``document_processing_jobs``, ``ai_generation_jobs``)
      additionally mirror their state there via the worker functions, so their
      status survives a restart; purely-ephemeral jobs (video/image generation)
      live only in this registry.
    * Every job records the owning ``user_id`` so status reads can be authorised
      and one user can never observe another user's job.

This is a single-process design (appropriate for the current deployment). Moving
to multiple workers would mean swapping this module for a shared queue (e.g.
Redis/RQ or Celery) without changing the service-layer contract.
"""

from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

from app.core.config import settings
from app.core.logging import get_logger, request_id_ctx, user_id_ctx
from app.realtime.manager import publish_job_event

logger = get_logger(__name__)


class JobState(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


@dataclass
class JobRecord:
    job_id: str
    kind: str
    user_id: str
    state: JobState = JobState.pending
    progress_pct: int = 0
    message: str = ""
    error_message: Optional[str] = None
    result: dict[str, Any] = field(default_factory=dict)
    # A stable reference to a related domain entity (e.g. document_id, lesson_id)
    # so clients can poll by that entity if they prefer.
    entity_id: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_public(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "kind": self.kind,
            "status": self.state.value,
            "progress_pct": self.progress_pct,
            "message": self.message,
            "error_message": self.error_message,
            "result": self.result or None,
            "entity_id": self.entity_id,
        }


class JobContext:
    """Handed to a worker so it can report progress and results.

    Exposes the owning ``user_id`` (so a worker can address realtime events and
    scope any privileged lookups), the job ``kind`` and any related ``entity_id``.
    Progress/result mutations flow back through the manager, which mirrors them to
    the owner over the realtime channel.
    """

    def __init__(
        self,
        manager: "JobManager",
        job_id: str,
        *,
        user_id: str,
        kind: str,
        entity_id: Optional[str] = None,
    ) -> None:
        self._manager = manager
        self.job_id = job_id
        self.user_id = user_id
        self.kind = kind
        self.entity_id = entity_id

    def update(self, *, progress_pct: Optional[int] = None, message: Optional[str] = None) -> None:
        self._manager._update(self.job_id, progress_pct=progress_pct, message=message)

    def progress(self, pct: int, message: str = "") -> None:
        self.update(progress_pct=pct, message=message)

    def set_result(self, result: dict[str, Any]) -> None:
        self._manager._set_result(self.job_id, result)


class JobManager:
    def __init__(self, max_workers: int) -> None:
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix="lumina-job"
        )
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.Lock()

    # -- registry helpers ---------------------------------------------------
    def _update(
        self, job_id: str, *, progress_pct: Optional[int] = None, message: Optional[str] = None
    ) -> None:
        snapshot: Optional[dict[str, Any]] = None
        with self._lock:
            rec = self._jobs.get(job_id)
            if not rec:
                return
            if progress_pct is not None:
                rec.progress_pct = max(0, min(100, int(progress_pct)))
            if message is not None:
                rec.message = message
            rec.updated_at = time.time()
            snapshot = self._event_snapshot(rec)
        self._publish(snapshot)

    def _set_result(self, job_id: str, result: dict[str, Any]) -> None:
        with self._lock:
            rec = self._jobs.get(job_id)
            if rec:
                rec.result = result or {}
                rec.updated_at = time.time()

    def _set_state(
        self, job_id: str, state: JobState, *, error_message: Optional[str] = None
    ) -> None:
        snapshot: Optional[dict[str, Any]] = None
        with self._lock:
            rec = self._jobs.get(job_id)
            if not rec:
                return
            rec.state = state
            if error_message is not None:
                rec.error_message = error_message
            if state == JobState.completed:
                rec.progress_pct = 100
            rec.updated_at = time.time()
            snapshot = self._event_snapshot(rec)
        self._publish(snapshot)

    @staticmethod
    def _event_snapshot(rec: JobRecord) -> dict[str, Any]:
        """Copy the fields needed to publish a realtime event (call under lock)."""
        return {
            "user_id": rec.user_id,
            "job_id": rec.job_id,
            "kind": rec.kind,
            "status": rec.state.value,
            "progress_pct": rec.progress_pct,
            "message": rec.message,
            "result": rec.result or None,
            "error_message": rec.error_message,
        }

    def _publish(self, snapshot: Optional[dict[str, Any]]) -> None:
        """Push a job event to the owning user (best-effort, never fatal).

        Called *outside* the registry lock so a slow/failed publish can never
        stall other jobs. Realtime delivery is a no-op when the user has no
        socket open or no event loop is bound (e.g. under tests).
        """
        if not snapshot:
            return
        try:
            publish_job_event(
                snapshot["user_id"],
                job_id=snapshot["job_id"],
                kind=snapshot["kind"],
                status=snapshot["status"],
                progress_pct=snapshot["progress_pct"],
                message=snapshot["message"],
                result=snapshot["result"],
                error_message=snapshot["error_message"],
            )
        except Exception:  # noqa: BLE001 - realtime must never break a job
            logger.debug("failed to publish job event", exc_info=True)

    def _gc_locked(self) -> None:
        cutoff = time.time() - settings.jobs_retention_minutes * 60
        stale = [
            jid
            for jid, rec in self._jobs.items()
            if rec.state in (JobState.completed, JobState.failed) and rec.updated_at < cutoff
        ]
        for jid in stale:
            self._jobs.pop(jid, None)

    # -- public API ---------------------------------------------------------
    def submit(
        self,
        kind: str,
        target: Callable[..., Any],
        *,
        user_id: str,
        entity_id: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """Enqueue ``target(ctx, **kwargs)`` and return a new job id."""
        job_id = uuid.uuid4().hex
        record = JobRecord(job_id=job_id, kind=kind, user_id=user_id, entity_id=entity_id)
        with self._lock:
            self._gc_locked()
            self._jobs[job_id] = record

        # Capture logging context so worker logs correlate with the request.
        req_id = request_id_ctx.get()
        usr_id = user_id_ctx.get()

        def _run() -> None:
            token_r = request_id_ctx.set(req_id)
            token_u = user_id_ctx.set(usr_id)
            ctx = JobContext(self, job_id, user_id=user_id, kind=kind, entity_id=entity_id)
            self._set_state(job_id, JobState.processing)
            try:
                target(ctx, **kwargs)
                self._set_state(job_id, JobState.completed)
            except Exception as exc:  # noqa: BLE001 - jobs must never crash the pool
                logger.exception("job %s (%s) failed", job_id, kind)
                self._set_state(
                    job_id,
                    JobState.failed,
                    error_message=_safe_error(exc),
                )
            finally:
                request_id_ctx.reset(token_r)
                user_id_ctx.reset(token_u)

        self._executor.submit(_run)
        return job_id

    def get(self, job_id: str, *, user_id: Optional[str] = None) -> Optional[JobRecord]:
        with self._lock:
            rec = self._jobs.get(job_id)
            if rec is None:
                return None
            if user_id is not None and rec.user_id != user_id:
                # Do not disclose existence of another user's job.
                return None
            return rec

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)


def _safe_error(exc: Exception) -> str:
    """A user-safe error message (never leak internals/stack)."""
    from app.core.exceptions import AppError

    if isinstance(exc, AppError):
        return exc.message
    return "The job failed to complete. Please try again."


# Process-wide singleton.
job_manager = JobManager(max_workers=settings.jobs_max_workers)
