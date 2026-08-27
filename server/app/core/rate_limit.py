"""In-process rate limiting.

``slowapi`` is not part of the dependency set, so this is a small, dependency-free
fixed-window rate limiter backed by an in-memory store guarded by a lock.

Limitations (documented deliberately): the counters live in the worker process,
so limits are enforced *per process*. For a multi-instance deployment this should
be backed by Redis; the :class:`RateLimiter` interface is intentionally small so
that swap is straightforward. The actual FastAPI dependencies that apply these
limits per-user / per-tier live in ``app.api.deps`` (where the authenticated
principal is available), keeping this module free of request concerns.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from .config import settings


@dataclass
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int  # seconds until the window resets


class RateLimiter:
    """Thread-safe fixed-window counter."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        # key -> (window_start_epoch, count)
        self._buckets: dict[str, tuple[float, int]] = {}
        self._last_gc = time.time()

    def _maybe_gc(self, now: float, window_seconds: int) -> None:
        # Periodically drop stale buckets to bound memory.
        if now - self._last_gc < 60:
            return
        cutoff = now - window_seconds
        stale = [k for k, (start, _) in self._buckets.items() if start < cutoff]
        for k in stale:
            self._buckets.pop(k, None)
        self._last_gc = now

    def hit(self, key: str, limit: int, window_seconds: int = 60) -> RateLimitResult:
        """Register a hit for ``key`` and report whether it is allowed."""
        if not settings.rate_limit_enabled or limit <= 0:
            return RateLimitResult(allowed=True, limit=limit, remaining=limit, retry_after=0)

        now = time.time()
        with self._lock:
            self._maybe_gc(now, window_seconds)
            window_start, count = self._buckets.get(key, (now, 0))
            if now - window_start >= window_seconds:
                # Window expired; reset.
                window_start, count = now, 0
            count += 1
            self._buckets[key] = (window_start, count)
            remaining = max(0, limit - count)
            retry_after = int(window_seconds - (now - window_start)) + 1
            allowed = count <= limit
            return RateLimitResult(
                allowed=allowed,
                limit=limit,
                remaining=remaining,
                retry_after=retry_after if not allowed else 0,
            )

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


# Process-wide limiter instance.
limiter = RateLimiter()
