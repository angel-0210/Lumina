"""Shared FastAPI dependencies.

Everything a route needs from the transport layer is assembled here so the route
functions stay declarative:

* :data:`DbConn` — a transactional SQLAlchemy ``Connection`` (commit on success,
  rollback on error), yielded by :func:`app.core.database.get_db`.
* :data:`Pagination` — bounded ``page`` / ``page_size`` query params.
* :func:`get_current_user` — verifies the ``Authorization: Bearer`` token and
  returns an :class:`~app.core.security.AuthPrincipal`. It also publishes the
  authenticated id into the logging context so request + worker logs correlate.
* :data:`CurrentUser` — the default authenticated principal, additionally subject
  to the per-user default rate limit.
* :data:`AiUser` — an authenticated principal subject to the *AI* rate limit,
  whose budget is chosen by the caller's subscription tier. Used on the
  expensive endpoints (upload/ingest, lesson generation, explore, crucible,
  image/video generation).
* :func:`require_role` / :data:`AdminUser` — RBAC guards (roles come from the
  verified JWT, see :mod:`app.core.security`).
* :func:`rate_limit_auth` — an IP-keyed limiter for the unauthenticated auth
  endpoints, to blunt credential-stuffing.

Rate limiting keys are per-principal (or per-IP for anonymous auth calls). The
limiter itself is the process-wide, dependency-free fixed-window counter in
:mod:`app.core.rate_limit`; swapping it for Redis later does not touch routes.
"""

from __future__ import annotations

from typing import Annotated, Callable, Optional

from fastapi import Depends, Header, Query, Request
from sqlalchemy.engine import Connection

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import ForbiddenError, RateLimitError
from app.core.logging import user_id_ctx
from app.core.pagination import PageParams, page_params
from app.core.rate_limit import limiter
from app.core.security import AuthPrincipal, authenticate, extract_bearer_token
from app.repositories import profile_repo

# --------------------------------------------------------------------------- #
# Core dependencies
# --------------------------------------------------------------------------- #
DbConn = Annotated[Connection, Depends(get_db)]
Pagination = Annotated[PageParams, Depends(page_params)]


def get_current_user(
    authorization: Annotated[Optional[str], Header(alias="Authorization")] = None,
) -> AuthPrincipal:
    """Authenticate the caller from the ``Authorization`` header.

    Raises 401 when the header is missing/malformed or the token fails
    verification. On success the principal id is recorded in the logging context
    so every log line for this request (and any background job it enqueues) is
    attributable to the user.
    """
    token = extract_bearer_token(authorization)
    principal = authenticate(token)
    user_id_ctx.set(principal.id)
    return principal


# The bare authenticated principal (no rate limiting). Used where a limit is
# either applied differently or would be redundant (e.g. logout).
RawUser = Annotated[AuthPrincipal, Depends(get_current_user)]


# --------------------------------------------------------------------------- #
# Rate limiting
# --------------------------------------------------------------------------- #
def _enforce(key: str, limit: int) -> None:
    result = limiter.hit(key, limit)
    if not result.allowed:
        raise RateLimitError(retry_after=result.retry_after)


def rate_limit_default(principal: RawUser) -> AuthPrincipal:
    """Apply the per-user default request budget and return the principal."""
    _enforce(f"rl:default:{principal.id}", settings.rate_limit_default_per_min)
    return principal


def ai_rate_limit(principal: RawUser, conn: DbConn) -> AuthPrincipal:
    """Apply the AI budget for the caller's subscription tier.

    The tier lives on the caller's profile (``free`` / ``pro`` / ``enterprise``);
    we read it on the same connection the handler will use (FastAPI caches the
    ``get_db`` dependency within a request, so this adds no extra transaction).
    """
    profile = profile_repo.get(conn, principal.id) or {}
    tier = (profile.get("subscription") or "free").lower()
    _enforce(f"rl:ai:{principal.id}", settings.ai_rate_limit_for_tier(tier))
    return principal


def rate_limit_auth(request: Request) -> None:
    """IP-keyed limit for anonymous auth endpoints (signup/login/refresh).

    Anonymous callers have no principal to key on, so we bound attempts per
    client address to blunt credential-stuffing. Best-effort: if the client
    address is unavailable the limit is simply not applied.
    """
    client = request.client.host if request.client else None
    if not client:
        return
    # A tighter fixed budget than the default per-minute request limit.
    _enforce(f"rl:auth:{client}", settings.rate_limit_default_per_min)


# The standard authenticated principal (default rate limit applied).
CurrentUser = Annotated[AuthPrincipal, Depends(rate_limit_default)]
# An authenticated principal on the AI budget (expensive endpoints).
AiUser = Annotated[AuthPrincipal, Depends(ai_rate_limit)]


# --------------------------------------------------------------------------- #
# RBAC
# --------------------------------------------------------------------------- #
def require_role(*roles: str) -> Callable[[AuthPrincipal], AuthPrincipal]:
    """Build a dependency that requires the caller to hold one of ``roles``.

    Admins satisfy every role check (see :meth:`AuthPrincipal.has_role`). Roles
    are derived from the verified token's ``app_metadata`` claims.
    """

    def _dep(principal: RawUser) -> AuthPrincipal:
        if roles and not any(principal.has_role(r) for r in roles):
            raise ForbiddenError()
        return principal

    return _dep


# Convenience guard for admin-only operations (defense-in-depth for any future
# administrative surface; ownership is always additionally enforced in services).
AdminUser = Annotated[AuthPrincipal, Depends(require_role("admin"))]
