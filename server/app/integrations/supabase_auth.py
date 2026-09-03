"""Supabase Auth (GoTrue) client — signup / login / refresh / logout.

Calls the GoTrue REST API with the project **anon key** (the public client key,
safe to use server-side for auth flows). Passwords are forwarded straight to
Supabase over TLS and never logged or stored by us. Tokens returned here are
handed to the client; verification of subsequent requests happens in
``app.core.security``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    ServiceUnavailableError,
    UnauthorizedError,
)
from app.core.logging import get_logger

logger = get_logger(__name__)

_TIMEOUT = 15.0


@dataclass
class AuthSession:
    access_token: str
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None
    token_type: str = "bearer"
    user: dict[str, Any] = field(default_factory=dict)


def _base_url() -> str:
    if not settings.supabase_configured:
        raise ServiceUnavailableError(
            "Authentication is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing)."
        )
    return settings.supabase_url.rstrip("/") + "/auth/v1"


def _headers() -> dict[str, str]:
    return {
        "apikey": settings.supabase_anon_key or "",
        "Content-Type": "application/json",
    }


def _post(path: str, *, json: dict[str, Any], auth_token: Optional[str] = None) -> httpx.Response:
    headers = _headers()
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            return client.post(_base_url() + path, headers=headers, json=json)
    except httpx.HTTPError as exc:
        logger.warning("gotrue %s transport error: %s", path, exc)
        raise ServiceUnavailableError("Unable to reach the authentication service.") from exc


def _session_from_payload(payload: dict[str, Any]) -> AuthSession:
    # token endpoints return the session at the top level; signup may nest it.
    session = payload
    if "access_token" not in payload and isinstance(payload.get("session"), dict):
        session = payload["session"]
    user = payload.get("user") or session.get("user") or {}
    return AuthSession(
        access_token=session.get("access_token", ""),
        refresh_token=session.get("refresh_token"),
        expires_in=session.get("expires_in"),
        token_type=session.get("token_type", "bearer"),
        user=user,
    )


def _error_message(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except Exception:
        return "Authentication request failed."
    return (
        body.get("msg")
        or body.get("error_description")
        or body.get("message")
        or body.get("error")
        or "Authentication request failed."
    )


def sign_up(*, email: str, password: str, name: str) -> AuthSession:
    resp = _post(
        "/signup",
        json={"email": email, "password": password, "data": {"name": name}},
    )
    if resp.status_code in (400, 422):
        msg = _error_message(resp)
        if "already" in msg.lower() or "registered" in msg.lower():
            raise ConflictError("An account with this email already exists.")
        raise BadRequestError(msg)
    if resp.status_code >= 400:
        logger.warning("gotrue signup returned %s", resp.status_code)
        raise ServiceUnavailableError("Could not create the account right now.")
    return _session_from_payload(resp.json())


def sign_in(*, email: str, password: str) -> AuthSession:
    resp = _post("/token?grant_type=password", json={"email": email, "password": password})
    if resp.status_code in (400, 401):
        raise UnauthorizedError("Invalid email or password.")
    if resp.status_code >= 400:
        logger.warning("gotrue login returned %s", resp.status_code)
        raise ServiceUnavailableError("Could not sign in right now.")
    return _session_from_payload(resp.json())


def refresh(*, refresh_token: str) -> AuthSession:
    resp = _post("/token?grant_type=refresh_token", json={"refresh_token": refresh_token})
    if resp.status_code in (400, 401):
        raise UnauthorizedError("Invalid or expired refresh token.")
    if resp.status_code >= 400:
        logger.warning("gotrue refresh returned %s", resp.status_code)
        raise ServiceUnavailableError("Could not refresh the session right now.")
    return _session_from_payload(resp.json())


def sign_out(*, access_token: str) -> None:
    """Best-effort server-side logout (revokes the refresh token)."""
    try:
        resp = _post("/logout", json={}, auth_token=access_token)
        if resp.status_code >= 400 and resp.status_code != 401:
            logger.info("gotrue logout returned %s", resp.status_code)
    except ServiceUnavailableError:
        # Logout is best-effort; the client discards tokens regardless.
        pass


def get_google_oauth_url(redirect_to: Optional[str] = None) -> str:
    """Generate the Supabase Auth Google OAuth authorization URL."""
    base = _base_url() + "/authorize?provider=google"
    if redirect_to:
        import urllib.parse
        base += f"&redirect_to={urllib.parse.quote(redirect_to)}"
    return base


def sign_in_with_id_token(*, id_token: str, provider: str = "google") -> AuthSession:
    """Exchange an ID token (from Google Sign-In) for a Supabase session."""
    resp = _post("/token?grant_type=id_token", json={"provider": provider, "id_token": id_token})
    if resp.status_code in (400, 401):
        raise UnauthorizedError("Invalid or expired OAuth token.")
    if resp.status_code >= 400:
        logger.warning("gotrue id_token login returned %s", resp.status_code)
        raise ServiceUnavailableError("Could not sign in with Google right now.")
    return _session_from_payload(resp.json())

