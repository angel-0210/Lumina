"""Realtime WebSocket route.

Pushes live progress/completion events for the caller's background jobs
(document ingestion, scene/image/video generation) so the client need not poll.

Auth: browsers can't set an ``Authorization`` header on a WebSocket, so the
access token is passed as the ``token`` query parameter (an ``Authorization:
Bearer`` header is also accepted for non-browser clients). The socket is
registered under the *authenticated* user id, and the manager only ever
addresses events to their owner — one user can never receive another's events.

The token is verified off the event loop (verification may make a blocking
network call to GoTrue). Inbound frames are ignored; the receive loop exists
only to detect disconnects.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.core.security import authenticate, extract_bearer_token
from app.realtime.manager import connection_manager

logger = get_logger(__name__)

router = APIRouter()

# Close codes (application range) — 4401 mirrors HTTP 401 for the client.
_WS_UNAUTHORIZED = 4401


def _token_from(websocket: WebSocket, token: Optional[str]) -> Optional[str]:
    if token:
        return token
    header = websocket.headers.get("authorization")
    if header:
        try:
            return extract_bearer_token(header)
        except AppError:
            return None
    return None


@router.websocket("/realtime/ws")
async def realtime_ws(websocket: WebSocket, token: Optional[str] = Query(default=None)):
    raw = _token_from(websocket, token)
    if not raw:
        await websocket.close(code=_WS_UNAUTHORIZED)
        return

    try:
        principal = await run_in_threadpool(authenticate, raw)
    except AppError:
        await websocket.close(code=_WS_UNAUTHORIZED)
        return
    except Exception:  # noqa: BLE001 - never surface internals over the socket
        logger.exception("unexpected error authenticating websocket")
        await websocket.close(code=_WS_UNAUTHORIZED)
        return

    await connection_manager.connect(principal.id, websocket)
    try:
        while True:
            # We don't process client messages; this await returns on disconnect.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001 - defensive: any socket error ends the loop
        logger.debug("websocket receive loop ended", exc_info=True)
    finally:
        connection_manager.disconnect(principal.id, websocket)
