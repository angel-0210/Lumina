"""Profile routes: read, update profile information and manage profile avatar."""

from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from app.api.deps import CurrentUser, DbConn
from app.core.responses import success
from app.schemas.profile import ProfileUpdate
from app.services import profile_service

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("")
def get_profile(principal: CurrentUser, conn: DbConn):
    """Return the caller's profile (id, name, email, avatar_url, subscription)."""
    return success(profile_service.get_profile(conn, principal))


@router.patch("")
def update_profile(req: ProfileUpdate, principal: CurrentUser, conn: DbConn):
    """Update the caller's display name."""
    return success(profile_service.update_profile(conn, principal, req))


@router.post("/avatar")
def upload_avatar(principal: CurrentUser, conn: DbConn, file: UploadFile = File(...)):
    """Upload and set a new profile avatar photo."""
    data = file.file.read()
    updated_profile = profile_service.upload_avatar(
        conn, principal, data=data, content_type=file.content_type or "image/jpeg"
    )
    return success(updated_profile)


@router.delete("/avatar")
def delete_avatar(principal: CurrentUser, conn: DbConn):
    """Remove the caller's profile avatar photo."""
    updated_profile = profile_service.delete_avatar(conn, principal)
    return success(updated_profile)
