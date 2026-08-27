"""Concept Crucible routes: Socratic assessment.

``start`` opens a fresh attempt and returns the first grounded question;
``respond`` records an answer and returns either the next question or, on the
final turn, the graded result with per-concept scores. Both call the model and
are on the AI rate-limit budget. History reads are scoped to the caller.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import AiUser, CurrentUser, DbConn, Pagination
from app.core.responses import paginated, success
from app.schemas.crucible import CrucibleRespondRequest, CrucibleStartRequest
from app.services import crucible_service

router = APIRouter(prefix="/crucible", tags=["crucible"])


@router.post("/start")
def start(req: CrucibleStartRequest, principal: AiUser, conn: DbConn):
    """Begin a Socratic assessment for a topic and return the first question."""
    return success(crucible_service.start(conn, principal, req))


@router.post("/{session_id}/respond")
def respond(
    session_id: str, req: CrucibleRespondRequest, principal: AiUser, conn: DbConn
):
    """Submit an answer; return the next question or the final grade."""
    return success(crucible_service.respond(conn, principal, session_id, req))


@router.get("/sessions")
def list_sessions(principal: CurrentUser, conn: DbConn, page: Pagination):
    """List the caller's past crucible sessions, paginated."""
    items, total = crucible_service.list_sessions(
        conn, principal, limit=page.limit, offset=page.offset
    )
    return paginated(items, page=page.page, page_size=page.page_size, total=total)


@router.get("/sessions/{session_id}")
def get_session(session_id: str, principal: CurrentUser, conn: DbConn):
    """Return one crucible session with its dialogue and concept scores."""
    return success(crucible_service.get_session(conn, principal, session_id))
