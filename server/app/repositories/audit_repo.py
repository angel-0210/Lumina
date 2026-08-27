"""Audit log repository.

Most mutations are audited automatically by database triggers
(``process_audit_log``). This repository is used for events the triggers do not
capture — notably ``login`` / ``logout`` — written from the service layer.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.engine import Connection


def log_auth_event(conn: Connection, *, user_id: str, action: str) -> None:
    """Record a ``login`` or ``logout`` event. Best-effort; never raises upward."""
    if action not in {"login", "logout"}:
        return
    try:
        conn.execute(
            text(
                """
                INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
                VALUES (:user_id, CAST(:action AS audit_action), 'auth', :user_id)
                """
            ),
            {"user_id": user_id, "action": action},
        )
    except Exception:
        # Auditing must never break the primary operation.
        pass


def log_event(
    conn: Connection,
    *,
    user_id: Optional[str],
    action: str,
    entity_type: str,
    entity_id: str,
    old_state: Optional[dict[str, Any]] = None,
    new_state: Optional[dict[str, Any]] = None,
) -> None:
    import json

    try:
        conn.execute(
            text(
                """
                INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_state, new_state)
                VALUES (:user_id, CAST(:action AS audit_action), :entity_type, :entity_id,
                        CAST(:old_state AS jsonb), CAST(:new_state AS jsonb))
                """
            ),
            {
                "user_id": user_id,
                "action": action,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "old_state": json.dumps(old_state) if old_state is not None else None,
                "new_state": json.dumps(new_state) if new_state is not None else None,
            },
        )
    except Exception:
        pass
