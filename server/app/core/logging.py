"""Structured application logging.

Provides ``configure_logging`` (called once at startup) and ``get_logger``.
Supports plain or JSON formatted logs (``LOG_JSON``) and injects a per-request
correlation id via a ``contextvars`` context. A redaction filter guards against
accidentally logging secrets (API keys, tokens, passwords).

Security requirement: never log API keys, passwords, access tokens or secrets.
The :class:`RedactionFilter` provides defense-in-depth against that, but callers
must still avoid passing sensitive values into log messages.
"""

from __future__ import annotations

import json
import logging
import re
import sys
from contextvars import ContextVar
from typing import Any, Optional

# Correlation id for the current request (set by middleware).
request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
user_id_ctx: ContextVar[Optional[str]] = ContextVar("user_id", default=None)

_CONFIGURED = False

# Patterns that look like secrets and should be scrubbed from log output.
_REDACT_PATTERNS = [
    re.compile(r"(authorization\"?\s*[:=]\s*\"?)(bearer\s+)?[A-Za-z0-9._\-]+", re.I),
    re.compile(r"(api[_-]?key\"?\s*[:=]\s*\"?)[A-Za-z0-9._\-]+", re.I),
    re.compile(r"(secret\"?\s*[:=]\s*\"?)[A-Za-z0-9._\-]+", re.I),
    re.compile(r"(password\"?\s*[:=]\s*\"?)[^\s\"',]+", re.I),
    re.compile(r"(access_token\"?\s*[:=]\s*\"?)[A-Za-z0-9._\-]+", re.I),
    re.compile(r"(refresh_token\"?\s*[:=]\s*\"?)[A-Za-z0-9._\-]+", re.I),
    # Bare JWTs (three base64url segments).
    re.compile(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+"),
]


def _redact(message: str) -> str:
    if not message:
        return message
    redacted = message
    for pattern in _REDACT_PATTERNS:
        if pattern.groups:
            redacted = pattern.sub(lambda m: f"{m.group(1)}***", redacted)
        else:
            redacted = pattern.sub("***", redacted)
    return redacted


class RedactionFilter(logging.Filter):
    """Scrubs secret-looking substrings from formatted log messages."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            if isinstance(record.msg, str):
                record.msg = _redact(record.msg)
        except Exception:  # pragma: no cover - never let logging break the app
            pass
        return True


class ContextFilter(logging.Filter):
    """Adds request/user correlation ids to every record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get() or "-"
        record.user_id = user_id_ctx.get() or "-"
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            "user_id": getattr(record, "user_id", "-"),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str = "INFO", json_logs: bool = False) -> None:
    """Configure the root logger. Idempotent."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    root = logging.getLogger()
    root.setLevel(level.upper())

    # Clear any pre-existing handlers (e.g. from uvicorn) to avoid duplicates.
    for handler in list(root.handlers):
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    if json_logs:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-7s [%(request_id)s] %(name)s: %(message)s"
            )
        )
    handler.addFilter(ContextFilter())
    handler.addFilter(RedactionFilter())
    root.addHandler(handler)

    # Tame noisy third-party loggers.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Return a module logger. Ensures logging is configured at least minimally."""
    if not _CONFIGURED:
        # Attach context/redaction filters even before explicit configuration so
        # that early import-time logs (e.g. from database.py) are safe.
        logging.basicConfig(level="INFO", stream=sys.stdout)
        for handler in logging.getLogger().handlers:
            handler.addFilter(ContextFilter())
            handler.addFilter(RedactionFilter())
    return logging.getLogger(name)
