"""WebSocket connection manager + realtime job-event bus.

Purpose
    Push progress/completion events for background jobs (document ingestion,
    scene/image/video generation) to the user who owns them, so a client can get
    live updates instead of polling. This is the realtime half of the async job
    architecture; the polling half is ``job_service`` / the jobs status endpoint.

Design
    * Connections are tracked per ``user_id`` (a user may have several tabs open).
    * A user can only ever be sent their *own* events — the endpoint authenticates
      the socket and registers it under the authenticated ``user_id``; broadcasts
      are addressed by ``user_id`` and never leak across users.
    * Background jobs run in worker **threads**, not the event loop, so they can't
      ``await`` a send. :meth:`publish_threadsafe` bridges that gap: the ASGI loop
      is captured at startup via :meth:`bind_loop`, and worker threads schedule
      sends onto it with ``run_coroutine_threadsafe``. If no loop is bound (e.g.
      during tests), publishing is a safe no-op.

This is an in-process manager (matching the single-process job manager). A
multi-process deployment would back this with a shared pub/sub (e.g. Redis)
without changing the call sites.
"""

from __future__ import annotations

import asyncio
import threading
from typing import Any, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        # user_id -> set of connected WebSocket objects
        self._by_user: dict[str, set[Any]] = {}
        self._lock = threading.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    # -- lifecycle ----------------------------------------------------------
    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Capture the running ASGI event loop (called once at startup)."""
        self._loop = loop

    async def connect(self, user_id: str, websocket: Any) -> None:
        await websocket.accept()
        with self._lock:
            self._by_user.setdefault(user_id, set()).add(websocket)
        logger.info("ws connected for user (open sockets: %d)", self._count(user_id))

    def disconnect(self, user_id: str, websocket: Any) -> None:
        with self._lock:
            conns = self._by_user.get(user_id)
            if conns:
                conns.discard(websocket)
                if not conns:
                    self._by_user.pop(user_id, None)

    def _count(self, user_id: str) -> int:
        with self._lock:
            return len(self._by_user.get(user_id, ()))

    def _sockets_for(self, user_id: str) -> list[Any]:
        with self._lock:
            return list(self._by_user.get(user_id, ()))

    # -- sending ------------------------------------------------------------
    async def send_to_user(self, user_id: str, payload: dict[str, Any]) -> None:
        """Send a JSON payload to every socket the user has open (best-effort)."""
        dead: list[Any] = []
        for ws in self._sockets_for(user_id):
            try:
                await ws.send_json(payload)
            except Exception:  # noqa: BLE001 - a broken socket must not stop others
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    def publish_threadsafe(self, user_id: str, payload: dict[str, Any]) -> None:
        """Schedule a send from a non-async context (e.g. a worker thread).

        No-op when no event loop is bound or the user has no open sockets.
        """
        if not user_id or self._loop is None:
            return
        if not self._sockets_for(user_id):
            return
        try:
            asyncio.run_coroutine_threadsafe(self.send_to_user(user_id, payload), self._loop)
        except Exception:  # noqa: BLE001 - realtime is best-effort, never fatal
            logger.debug("failed to schedule realtime publish", exc_info=True)


# Process-wide singleton used by the WS endpoint and by workers to publish events.
connection_manager = ConnectionManager()


def publish_job_event(
    user_id: str,
    *,
    job_id: str,
    kind: str,
    status: str,
    progress_pct: int = 0,
    message: str = "",
    result: Optional[dict[str, Any]] = None,
    error_message: Optional[str] = None,
) -> None:
    """Convenience: publish a normalised job event to the owning user."""
    connection_manager.publish_threadsafe(
        user_id,
        {
            "type": "job",
            "job_id": job_id,
            "kind": kind,
            "status": status,
            "progress_pct": progress_pct,
            "message": message,
            "result": result,
            "error_message": error_message,
        },
    )
