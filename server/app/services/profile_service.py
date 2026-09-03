"""Profile service — read and update caller's profile, including profile avatar photo."""

from __future__ import annotations

import base64
from typing import Optional
from sqlalchemy.engine import Connection

from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError, PayloadTooLargeError
from app.core.security import AuthPrincipal
from app.integrations import cloudinary_client
from app.repositories import profile_repo
from app.schemas.profile import Profile, ProfileUpdate

MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB


def get_profile(conn: Connection, principal: AuthPrincipal) -> Profile:
    row = profile_repo.get(conn, principal.id)
    if row is None:
        # Self-heal a missing profile row from the verified token identity.
        row = profile_repo.upsert(conn, principal.id, email=principal.email)
    if row is None:
        raise NotFoundError("Profile not found.")
    return Profile.model_validate(row)


def update_profile(
    conn: Connection, principal: AuthPrincipal, req: ProfileUpdate
) -> Profile:
    row = profile_repo.update_profile(conn, principal.id, name=req.name)
    if row is None:
        raise NotFoundError("Profile not found.")
    return Profile.model_validate(row)


def upload_avatar(
    conn: Connection,
    principal: AuthPrincipal,
    *,
    data: bytes,
    content_type: str,
) -> Profile:
    """Upload user avatar photo to Cloudinary / storage and update profile."""
    if not data:
        raise BadRequestError("Empty avatar image file.")
    if len(data) > MAX_AVATAR_BYTES:
        raise PayloadTooLargeError("Avatar image size exceeds maximum 5MB limit.")

    mime = (content_type or "").split(";")[0].strip().lower()
    if mime not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise BadRequestError("Invalid image format. Supported formats: JPEG, PNG, WebP, GIF.")

    current_profile = profile_repo.get(conn, principal.id) or {}
    old_public_id = current_profile.get("avatar_public_id")

    avatar_url = None
    avatar_public_id = None

    if settings.cloudinary_configured:
        try:
            folder = f"{settings.cloudinary_upload_folder}/avatars/{principal.id}"
            uploaded = cloudinary_client.upload_media(
                data, resource_type="image", folder=folder
            )
            avatar_url = uploaded.url
            avatar_public_id = uploaded.public_id
            
            if old_public_id:
                cloudinary_client.delete_media(old_public_id, resource_type="image")
        except Exception:
            b64 = base64.b64encode(data).decode("utf-8")
            avatar_url = f"data:{mime};base64,{b64}"
            avatar_public_id = None
    else:
        b64 = base64.b64encode(data).decode("utf-8")
        avatar_url = f"data:{mime};base64,{b64}"
        avatar_public_id = None


    updated_row = profile_repo.update_profile(
        conn, principal.id, avatar_url=avatar_url, avatar_public_id=avatar_public_id
    )
    if updated_row is None:
        raise NotFoundError("Profile not found.")
    return Profile.model_validate(updated_row)


def delete_avatar(conn: Connection, principal: AuthPrincipal) -> Profile:
    """Remove user avatar photo."""
    current_profile = profile_repo.get(conn, principal.id) or {}
    old_public_id = current_profile.get("avatar_public_id")

    if settings.cloudinary_configured and old_public_id:
        cloudinary_client.delete_media(old_public_id, resource_type="image")

    updated_row = profile_repo.update_profile(
        conn, principal.id, avatar_url=None, avatar_public_id=None
    )
    if updated_row is None:
        raise NotFoundError("Profile not found.")
    return Profile.model_validate(updated_row)
