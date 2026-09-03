"""Search routes — unified query endpoint across user-scoped learning content."""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbConn
from app.core.responses import success
from app.services import search_service

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def search(
    principal: CurrentUser,
    conn: DbConn,
    q: str = Query(default="", description="Search query string"),
    limit: int = Query(default=20, ge=1, le=100),
):
    """Perform a user-isolated search across documents, topics, concepts, and material chunks."""
    results = search_service.search_all(conn, user_id=principal.id, query=q, limit=limit)
    return success(results)
