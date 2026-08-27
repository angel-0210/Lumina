"""Profile service — read and update the caller's own profile."""

from __future__ import annotations

from sqlalchemy.engine import Connection

from app.core.exceptions import NotFoundError
from app.core.security import AuthPrincipal
from app.repositories import profile_repo
from app.schemas.profile import Profile, ProfileUpdate


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
