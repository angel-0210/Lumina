"""Notification routes — device push token registration and management."""

from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbConn
from app.core.responses import success
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


class RegisterTokenRequest(BaseModel):
    token: str = Field(..., description="Expo Push Token")
    platform: str = Field(default="android", description="Device OS ('android' | 'ios' | 'web')")


class UnregisterTokenRequest(BaseModel):
    token: str = Field(..., description="Expo Push Token to remove")


@router.post("/tokens", status_code=status.HTTP_201_CREATED)
def register_device_token(req: RegisterTokenRequest, principal: CurrentUser, conn: DbConn):
    """Register an authenticated device token for push notifications."""
    result = notification_service.register_token(
        conn, user_id=principal.id, token=req.token, platform=req.platform
    )
    return success(result)


@router.delete("/tokens")
def unregister_device_token(req: UnregisterTokenRequest, principal: CurrentUser, conn: DbConn):
    """Unregister a device token upon logout or permission revocation."""
    result = notification_service.unregister_token(
        conn, user_id=principal.id, token=req.token
    )
    return success(result)
