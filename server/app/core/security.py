"""Authentication & security primitives.

Verifies Supabase-issued JWT access tokens and produces an :class:`AuthPrincipal`.

Two verification strategies, tried in order:

1. **Local HS256 verification** using ``SUPABASE_JWT_SECRET`` — fast, no network.
   Supabase's legacy access tokens are signed HS256 with the project JWT secret.
2. **GoTrue fallback** — call ``GET {SUPABASE_URL}/auth/v1/user`` with the token.
   Used when no local secret is configured or the token uses an asymmetric alg
   (newer projects). This validates the token server-side with Supabase.

RBAC: Supabase profiles have no ``role`` column, so roles are read from the JWT
``app_metadata.role``/``app_metadata.roles`` claims (default role ``user``).
``require_role`` (in ``app.api.deps``) uses these.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

import httpx
import jwt

from .config import settings
from .exceptions import ServiceUnavailableError, UnauthorizedError
from .logging import get_logger

logger = get_logger(__name__)

DEFAULT_ROLE = "user"


@dataclass
class AuthPrincipal:
    """The authenticated caller derived from a verified access token."""

    id: str
    email: Optional[str] = None
    roles: list[str] = field(default_factory=lambda: [DEFAULT_ROLE])
    token: Optional[str] = None
    claims: dict[str, Any] = field(default_factory=dict)

    @property
    def is_admin(self) -> bool:
        return "admin" in {r.lower() for r in self.roles}

    def has_role(self, role: str) -> bool:
        return role.lower() in {r.lower() for r in self.roles} or self.is_admin


def extract_bearer_token(authorization: Optional[str]) -> str:
    """Pull the token out of an ``Authorization: Bearer <token>`` header."""
    if not authorization:
        raise UnauthorizedError("Missing Authorization header.")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise UnauthorizedError("Malformed Authorization header.")
    return parts[1]


def _roles_from_claims(claims: dict[str, Any]) -> list[str]:
    roles: list[str] = []
    app_meta = claims.get("app_metadata") or {}
    if isinstance(app_meta, dict):
        if isinstance(app_meta.get("roles"), list):
            roles.extend(str(r) for r in app_meta["roles"])
        if app_meta.get("role"):
            roles.append(str(app_meta["role"]))
    # The top-level `role` in Supabase tokens is usually "authenticated"; keep it
    # only if nothing more specific was found.
    if not roles and claims.get("role"):
        roles.append(str(claims["role"]))
    if not roles:
        roles.append(DEFAULT_ROLE)
    # De-duplicate, preserve order.
    seen: set[str] = set()
    unique: list[str] = []
    for r in roles:
        if r not in seen:
            seen.add(r)
            unique.append(r)
    return unique


def _principal_from_claims(claims: dict[str, Any], token: str) -> AuthPrincipal:
    subject = claims.get("sub") or claims.get("id")
    if not subject:
        raise UnauthorizedError("Token is missing a subject claim.")
    return AuthPrincipal(
        id=str(subject),
        email=claims.get("email"),
        roles=_roles_from_claims(claims),
        token=token,
        claims=claims,
    )


def _decode_local(token: str) -> Optional[dict[str, Any]]:
    """Verify an HS256 token locally. Returns claims or ``None`` if not applicable."""
    if not settings.supabase_jwt_secret:
        return None
    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid access token.") from exc

    if header.get("alg") != "HS256":
        # Asymmetric token; defer to GoTrue.
        return None

    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience=settings.supabase_jwt_aud,
            options={"verify_aud": True},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Access token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid access token.") from exc


def authenticate(token: str) -> AuthPrincipal:
    """Verify a bearer token and return the authenticated principal."""
    if not token:
        raise UnauthorizedError("Missing access token.")

    # Fast path: local HS256 verification.
    claims = _decode_local(token)
    if claims is not None:
        return _principal_from_claims(claims, token)

    # Fallback: verify via GoTrue (asymmetric tokens or no local secret).
    user = _fetch_gotrue_user_sync(token)
    # Normalise the /user response into a claims-like dict.
    normalised = dict(user)
    if "sub" not in normalised and "id" in normalised:
        normalised["sub"] = normalised["id"]
    return _principal_from_claims(normalised, token)


def _fetch_gotrue_user_sync(token: str) -> dict[str, Any]:
    if not settings.supabase_configured:
        raise ServiceUnavailableError(
            "Authentication is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing)."
        )
    url = settings.supabase_url.rstrip("/") + "/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": settings.supabase_anon_key or "",
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("gotrue request failed: %s", exc)
        raise ServiceUnavailableError("Unable to reach the authentication service.") from exc

    if resp.status_code == 401:
        raise UnauthorizedError("Invalid or expired access token.")
    if resp.status_code >= 400:
        logger.warning("gotrue returned status %s", resp.status_code)
        raise UnauthorizedError("Could not verify the access token.")
    return resp.json()
