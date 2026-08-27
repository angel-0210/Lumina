"""Media-assets repository (AI-generated Cloudinary images/videos).

Stores only non-secret, client-safe metadata. Every user-facing read/write
enforces ownership on ``user_id`` because the pooled connection bypasses RLS.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func, insert, select, update
from sqlalchemy.engine import Connection

from app.models.tables import media_assets
from .base import first_dict, row_to_dict, rows_to_dicts


def create(
    conn: Connection,
    *,
    user_id: str,
    public_id: str,
    url: str,
    kind: str = "image",
    provider: str = "cloudinary",
    resource_type: str = "image",
    learning_session_id: Optional[str] = None,
    format: Optional[str] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    duration: Optional[float] = None,
    bytes: Optional[int] = None,
    prompt: Optional[str] = None,
) -> dict[str, Any]:
    stmt = (
        insert(media_assets)
        .values(
            user_id=user_id,
            learning_session_id=learning_session_id,
            kind=kind,
            provider=provider,
            resource_type=resource_type,
            public_id=public_id,
            url=url,
            format=format,
            width=width,
            height=height,
            duration=duration,
            bytes=bytes,
            prompt=prompt,
        )
        .returning(media_assets)
    )
    return first_dict(conn.execute(stmt))  # type: ignore[return-value]


def get(conn: Connection, asset_id: str, user_id: str) -> Optional[dict[str, Any]]:
    """Ownership-enforced fetch."""
    stmt = select(media_assets).where(
        media_assets.c.id == asset_id,
        media_assets.c.user_id == user_id,
    )
    return row_to_dict(conn.execute(stmt).first())


def get_internal(conn: Connection, asset_id: str) -> Optional[dict[str, Any]]:
    """No ownership filter — for background workers only. Never expose directly."""
    stmt = select(media_assets).where(media_assets.c.id == asset_id)
    return row_to_dict(conn.execute(stmt).first())


def list_for_user(
    conn: Connection,
    user_id: str,
    *,
    limit: int,
    offset: int,
    learning_session_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    conditions = [media_assets.c.user_id == user_id]
    if learning_session_id is not None:
        conditions.append(media_assets.c.learning_session_id == learning_session_id)
    stmt = (
        select(media_assets)
        .where(*conditions)
        .order_by(media_assets.c.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return rows_to_dicts(conn.execute(stmt))


def count_for_user(
    conn: Connection,
    user_id: str,
    *,
    learning_session_id: Optional[str] = None,
) -> int:
    conditions = [media_assets.c.user_id == user_id]
    if learning_session_id is not None:
        conditions.append(media_assets.c.learning_session_id == learning_session_id)
    stmt = select(func.count()).select_from(media_assets).where(*conditions)
    return int(conn.execute(stmt).scalar_one())


def update_after_generation(
    conn: Connection,
    asset_id: str,
    *,
    public_id: str,
    url: str,
    format: Optional[str] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    duration: Optional[float] = None,
    bytes: Optional[int] = None,
) -> Optional[dict[str, Any]]:
    """Worker-only fill-in of asset details once the upload completes."""
    stmt = (
        update(media_assets)
        .where(media_assets.c.id == asset_id)
        .values(
            public_id=public_id,
            url=url,
            format=format,
            width=width,
            height=height,
            duration=duration,
            bytes=bytes,
        )
        .returning(media_assets)
    )
    return first_dict(conn.execute(stmt))


def delete(conn: Connection, asset_id: str, user_id: str) -> bool:
    from sqlalchemy import delete as sql_delete

    stmt = (
        sql_delete(media_assets)
        .where(
            media_assets.c.id == asset_id,
            media_assets.c.user_id == user_id,
        )
        .returning(media_assets.c.id)
    )
    return conn.execute(stmt).first() is not None
