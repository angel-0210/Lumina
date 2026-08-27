"""Repository layer helpers.

Repositories build SQL with SQLAlchemy Core against the tables in
``app.models.tables`` and return plain dicts. **Ownership is enforced here, in
code**, because the pooled connection uses a privileged Postgres role that
bypasses Supabase RLS — every read/write filters on ``user_id`` (directly or via
an ``EXISTS`` join). RLS remains enabled in the DB as defense-in-depth.
"""

from __future__ import annotations

import uuid
from typing import Any, Iterable, Optional

from sqlalchemy.engine import Connection, Result, Row


def _normalize_value(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def row_to_dict(row: Optional[Row]) -> Optional[dict[str, Any]]:
    if row is None:
        return None
    mapping = row._mapping if hasattr(row, "_mapping") else row
    return {key: _normalize_value(val) for key, val in dict(mapping).items()}


def rows_to_dicts(result: Result) -> list[dict[str, Any]]:
    return [
        {key: _normalize_value(val) for key, val in dict(m).items()}
        for m in result.mappings().all()
    ]


def first_dict(result: Result) -> Optional[dict[str, Any]]:
    m = result.mappings().first()
    if m is None:
        return None
    return {key: _normalize_value(val) for key, val in dict(m).items()}


def format_vector(vec: Iterable[float]) -> str:
    """Format an embedding as a pgvector literal string: ``[0.1,0.2,...]``."""
    return "[" + ",".join(f"{float(x):.8f}" for x in vec) + "]"


def exec_returning_one(conn: Connection, stmt) -> Optional[dict[str, Any]]:
    """Execute an INSERT/UPDATE ... RETURNING and return a single dict row."""
    result = conn.execute(stmt)
    return first_dict(result)
