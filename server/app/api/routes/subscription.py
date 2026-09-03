"""Subscription routes — check subscription status and handle tier upgrade requests."""

from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter

from app.api.deps import CurrentUser, DbConn
from app.core.responses import success
from app.services import subscription_service

router = APIRouter(prefix="/subscription", tags=["subscription"])


class UpgradeRequest(BaseModel):
    tier: str = Field(default="pro", description="Target subscription tier ('pro' | 'enterprise')")


@router.get("/status")
def get_subscription_status(principal: CurrentUser, conn: DbConn):
    """Return the caller's active subscription status, plan limits, and tier perks."""
    return success(subscription_service.get_status(conn, principal))


@router.post("/upgrade")
def upgrade_subscription(req: UpgradeRequest, principal: CurrentUser, conn: DbConn):
    """Upgrade caller's subscription tier."""
    updated_profile = subscription_service.upgrade_subscription(conn, principal, target_tier=req.tier)
    return success(updated_profile)
