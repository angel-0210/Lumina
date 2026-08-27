"""Auth routes: signup / login / refresh / logout / current user.

Signup, login and refresh are anonymous (no bearer token) and are IP-rate-limited
to blunt credential stuffing; logout and ``/me`` require a valid access token.
Passwords are never logged and never persisted by us — they are forwarded to
Supabase GoTrue by the service layer.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.api.deps import DbConn, RawUser, rate_limit_auth
from app.core.responses import success
from app.schemas.auth import LoginRequest, RefreshRequest, SignupRequest
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit_auth)])
def signup(req: SignupRequest, conn: DbConn):
    """Create an account and return an authenticated session."""
    return success(auth_service.signup(conn, req))


@router.post("/login", dependencies=[Depends(rate_limit_auth)])
def login(req: LoginRequest, conn: DbConn):
    """Exchange email + password for an access/refresh token pair."""
    return success(auth_service.login(conn, req))


@router.post("/refresh", dependencies=[Depends(rate_limit_auth)])
def refresh(req: RefreshRequest, conn: DbConn):
    """Exchange a refresh token for a fresh session."""
    return success(auth_service.refresh(conn, req))


@router.post("/logout")
def logout(principal: RawUser, conn: DbConn):
    """Revoke the caller's Supabase session (best-effort) and audit the event."""
    return success(auth_service.logout(conn, principal))


@router.get("/me")
def me(principal: RawUser, conn: DbConn):
    """Return the authenticated user's identity + subscription."""
    return success(auth_service.current_user(conn, principal))
