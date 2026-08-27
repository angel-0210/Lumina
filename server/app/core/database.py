"""Database engine, connection pooling and FastAPI session dependency.

Lumina talks to Supabase's Postgres directly through SQLAlchemy Core using a
pooled ``psycopg2`` connection. **Important:** this connection uses a privileged
Postgres role and therefore *bypasses* Supabase Row Level Security. Ownership
and access control MUST be enforced in the repository/service layers (every
query filters on ``user_id`` / verifies ownership). RLS remains enabled in the
database as defense-in-depth for any other client.

The engine is created lazily-ish at import but is resilient: if ``DATABASE_URL``
is not configured we fall back to a local SQLite database so the app (and tests
that don't touch Postgres) can still import and boot.
"""

from __future__ import annotations

import contextlib
from typing import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

from .config import settings
from .logging import get_logger

logger = get_logger(__name__)

DATABASE_URL: str = settings.database_url


def _create_engine(url: str) -> Engine:
    """Build a SQLAlchemy engine with pool settings appropriate to the driver."""
    if url.startswith("sqlite"):
        # SQLite is only used for local/dev/test fallback.
        connect_args = {"check_same_thread": False}
        return create_engine(
            url,
            connect_args=connect_args,
            future=True,
            echo=settings.db_echo,
        )

    return create_engine(
        url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout,
        pool_recycle=settings.db_pool_recycle,
        pool_pre_ping=True,  # transparently recover from dropped connections
        future=True,
        echo=settings.db_echo,
    )


engine: Engine = _create_engine(DATABASE_URL)


def get_db() -> Iterator[Connection]:
    """FastAPI dependency yielding a transactional Core ``Connection``.

    A transaction is opened per request; it is committed if the request handler
    returns normally and rolled back if it raises. Repositories receive this
    connection and never manage their own transaction lifecycle.
    """
    conn = engine.connect()
    txn = conn.begin()
    try:
        yield conn
        txn.commit()
    except Exception:
        txn.rollback()
        raise
    finally:
        conn.close()


@contextlib.contextmanager
def connection_scope() -> Iterator[Connection]:
    """Transactional connection scope for code outside the request lifecycle.

    Used by background workers and scripts. Mirrors :func:`get_db` semantics
    (commit on success, rollback on error) but as a context manager.
    """
    conn = engine.connect()
    txn = conn.begin()
    try:
        yield conn
        txn.commit()
    except Exception:
        txn.rollback()
        raise
    finally:
        conn.close()


def check_database() -> bool:
    """Lightweight connectivity probe for health checks. Returns ``True`` on success."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:  # pragma: no cover - depends on live DB
        logger.warning("database health check failed: %s", exc)
        return False


def dispose_engine() -> None:
    """Dispose of the connection pool (called on application shutdown)."""
    engine.dispose()
