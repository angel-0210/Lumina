"""Profile routes: read and update the caller's own profile."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbConn
from app.core.responses import success
from app.schemas.profile import ProfileUpdate
from app.services import profile_service

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("")
def get_profile(principal: CurrentUser, conn: DbConn):
    """Return the caller's profile (id, name, email, subscription)."""
    return success(profile_service.get_profile(conn, principal))


@router.patch("")
def update_profile(req: ProfileUpdate, principal: CurrentUser, conn: DbConn):
    """Update the caller's display name."""
    return success(profile_service.update_profile(conn, principal, req))
