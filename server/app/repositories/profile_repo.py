"""Profiles repository."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection

from app.models.tables import profiles
from .base import first_dict, row_to_dict


def get(conn: Connection, user_id: str) -> Optional[dict[str, Any]]:
    stmt = select(profiles).where(profiles.c.id == user_id, profiles.c.deleted_at.is_(None))
    return row_to_dict(conn.execute(stmt).first())


def upsert(
    conn: Connection,
    user_id: str,
    *,
    name: Optional[str] = None,
    email: Optional[str] = None,
) -> dict[str, Any]:
    """Insert a profile if missing (the DB trigger usually creates it on signup)."""
    stmt = (
        pg_insert(profiles)
        .values(id=user_id, name=name, email=email)
        .on_conflict_do_nothing(index_elements=[profiles.c.id])
        .returning(profiles)
    )
    row = first_dict(conn.execute(stmt))
    if row is None:
        # Already existed; fetch it.
        row = get(conn, user_id)
        if row and (row.get("name") is None or row.get("name") == "New Learner") and name:
            row = update_profile(conn, user_id, name=name) or row
    return row  # type: ignore[return-value]


def update_profile(conn: Connection, user_id: str, **fields: Any) -> Optional[dict[str, Any]]:
    if not fields:
        return get(conn, user_id)
    stmt = (
        update(profiles)
        .where(profiles.c.id == user_id, profiles.c.deleted_at.is_(None))
        .values(**fields)
        .returning(profiles)
    )
    return first_dict(conn.execute(stmt))

