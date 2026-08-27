"""Auth service — signup / login / refresh / logout and the current user.

Wraps the GoTrue integration, then reconciles the returned identity with our
``profiles`` table (which owns ``subscription`` and the display name). Auth
events are audit-logged best-effort. Passwords never touch our logs or DB.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.engine import Connection

from app.core.exceptions import BadRequestError
from app.core.logging import get_logger
from app.core.security import AuthPrincipal
from app.integrations import supabase_auth
from app.repositories import audit_repo, profile_repo
from app.schemas.auth import (
    AuthResponse,
    AuthUser,
    LoginRequest,
    RefreshRequest,
    SignupRequest,
)
from app.schemas.common import MessageResponse

logger = get_logger(__name__)


def _metadata_name(user: dict[str, Any]) -> str | None:
    meta = user.get("user_metadata") or user.get("raw_user_meta_data") or {}
    if isinstance(meta, dict):
        return meta.get("name")
    return None


def _build_auth_response(conn: Connection, session: supabase_auth.AuthSession) -> AuthResponse:
    user = session.user or {}
    user_id = user.get("id") or user.get("sub")
    if not user_id:
        raise BadRequestError("Authentication response did not include a user.")
    email = user.get("email")
    meta_name = _metadata_name(user)

    # Ensure a profile row exists (the DB trigger normally creates it on signup)
    # and read the authoritative subscription/name from it.
    profile_repo.upsert(conn, str(user_id), name=meta_name, email=email)
    profile = profile_repo.get(conn, str(user_id)) or {}

    return AuthResponse(
        access_token=session.access_token,
        token_type=session.token_type or "bearer",
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
        user=AuthUser(
            id=str(user_id),
            email=profile.get("email") or email,
            name=profile.get("name") or meta_name,
            subscription=profile.get("subscription") or "free",
        ),
    )


def signup(conn: Connection, req: SignupRequest) -> AuthResponse:
    session = supabase_auth.sign_up(
        email=req.email, password=req.password, name=req.full_name
    )
    # When email confirmation is disabled, signup returns a session. When it is
    # required, no token is issued — sign in to obtain one, and surface a clear
    # message if the project requires confirmation first.
    if not session.access_token:
        try:
            session = supabase_auth.sign_in(email=req.email, password=req.password)
        except Exception:
            raise BadRequestError(
                "Account created. Please confirm your email address, then sign in."
            )
    response = _build_auth_response(conn, session)
    audit_repo.log_auth_event(conn, user_id=response.user.id, action="login")
    return response


def login(conn: Connection, req: LoginRequest) -> AuthResponse:
    session = supabase_auth.sign_in(email=req.email, password=req.password)
    response = _build_auth_response(conn, session)
    audit_repo.log_auth_event(conn, user_id=response.user.id, action="login")
    return response


def refresh(conn: Connection, req: RefreshRequest) -> AuthResponse:
    session = supabase_auth.refresh(refresh_token=req.refresh_token)
    return _build_auth_response(conn, session)


def logout(conn: Connection, principal: AuthPrincipal) -> MessageResponse:
    if principal.token:
        supabase_auth.sign_out(access_token=principal.token)
    audit_repo.log_auth_event(conn, user_id=principal.id, action="logout")
    return MessageResponse(message="Signed out.")


def current_user(conn: Connection, principal: AuthPrincipal) -> AuthUser:
    profile = profile_repo.get(conn, principal.id) or {}
    return AuthUser(
        id=principal.id,
        email=profile.get("email") or principal.email,
        name=profile.get("name"),
        subscription=profile.get("subscription") or "free",
    )
