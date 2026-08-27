"""Explore routes: grounded RAG chat.

A query is answered synchronously (retrieve -> assemble -> one grounded
generation) because the UI shows it inline; it is on the AI rate-limit budget.
Retrieval is always scoped to the caller's own documents. Conversation history
is paginated in chronological order.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import AiUser, CurrentUser, DbConn, Pagination
from app.core.responses import paginated, success
from app.schemas.explore import ExploreQueryRequest
from app.services import explore_service

router = APIRouter(prefix="/explore", tags=["explore"])


@router.post("/query")
def query(req: ExploreQueryRequest, principal: AiUser, conn: DbConn):
    """Answer a grounded question and persist the turn with its citations."""
    return success(explore_service.query(conn, principal, req))


@router.get("/conversations/{session_id}")
def get_conversation(
    session_id: str, principal: CurrentUser, conn: DbConn, page: Pagination
):
    """Return a conversation's messages (oldest first), paginated."""
    items, total = explore_service.get_conversation(
        conn, principal, session_id, limit=page.limit, offset=page.offset
    )
    return paginated(items, page=page.page, page_size=page.page_size, total=total)
