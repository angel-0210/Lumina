"""Analytics route.

Provides aggregated learning statistics for the caller.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbConn
from app.core.responses import success
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("")
def get_analytics(principal: CurrentUser, conn: DbConn):
    """Return aggregated analytics statistics for the caller."""
    return success(analytics_service.get_analytics(conn, principal))
