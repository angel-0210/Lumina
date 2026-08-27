"""Dashboard route: the home-screen aggregation.

Assembles recent documents, the mastery summary, a "continue learning" card and
headline counts in a single scoped call.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbConn
from app.core.responses import success
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard(principal: CurrentUser, conn: DbConn):
    """Return the aggregated dashboard for the caller."""
    return success(dashboard_service.get_dashboard(conn, principal))
