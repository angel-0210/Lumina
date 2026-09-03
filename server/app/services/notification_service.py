"""Notification service — register device tokens and send Expo push notifications."""

from __future__ import annotations

from typing import Any, Optional
import httpx
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection

from app.core.logging import get_logger
from app.models.tables import device_tokens
from app.repositories.base import rows_to_dicts

logger = get_logger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def register_token(
    conn: Connection, user_id: str, token: str, platform: str = "android"
) -> dict[str, Any]:
    """Register or update an Expo push token for the user."""
    token = token.strip()
    if not token:
        return {"registered": False}

    if conn.dialect.name == "sqlite":
        # SQLite fallback for local test envs
        conn.execute(
            delete(device_tokens).where(
                device_tokens.c.user_id == user_id, device_tokens.c.token == token
            )
        )
        conn.execute(
            device_tokens.insert().values(user_id=user_id, token=token, platform=platform)
        )
    else:
        stmt = (
            pg_insert(device_tokens)
            .values(user_id=user_id, token=token, platform=platform)
            .on_conflict_do_update(
                constraint="device_token_unique",
                set_={"platform": platform, "updated_at": text("now()")},
            )
        )
        conn.execute(stmt)

    return {"registered": True, "token": token, "platform": platform}


def unregister_token(conn: Connection, user_id: str, token: str) -> dict[str, Any]:
    """Remove a device token for the user."""
    conn.execute(
        delete(device_tokens).where(
            device_tokens.c.user_id == user_id, device_tokens.c.token == token
        )
    )
    return {"unregistered": True}


def get_user_tokens(conn: Connection, user_id: str) -> list[str]:
    """Fetch all active device tokens registered for a user."""
    stmt = select(device_tokens.c.token).where(device_tokens.c.user_id == user_id)
    rows = conn.execute(stmt).fetchall()
    return [r[0] for r in rows if r[0]]


def send_push_notification(
    conn: Connection,
    *,
    user_id: str,
    title: str,
    body: str,
    data: Optional[dict[str, Any]] = None,
) -> bool:
    """Send an Expo Push Notification to all active devices of a user."""
    tokens = get_user_tokens(conn, user_id)
    if not tokens:
        logger.debug("no push tokens registered for user %s", user_id)
        return False

    messages = [
        {
            "to": t,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
        }
        for t in tokens
    ]

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
            if resp.status_code == 200:
                logger.info("sent push notification to %d device(s) for user %s", len(tokens), user_id)
                return True
            logger.warning("expo push API returned status %s: %s", resp.status_code, resp.text)
    except Exception as exc:
        logger.warning("failed to send push notification: %s", exc)

    return False
