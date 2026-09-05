"""Authentication DTOs (signup / login / logout / refresh)."""

from __future__ import annotations

import re
from typing import Optional

from pydantic import Field, field_validator

from .common import Schema

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_email(value: str) -> str:
    value = value.strip().lower()
    if not _EMAIL_RE.match(value):
        raise ValueError("Invalid email address.")
    return value


class SignupRequest(Schema):
    # The frontend sends `fullName`; accept it via alias.
    full_name: str = Field(..., alias="fullName", min_length=1, max_length=120)
    email: str
    password: str = Field(..., min_length=8, max_length=256)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _validate_email(v)


class LoginRequest(Schema):
    email: str
    password: str = Field(..., min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _validate_email(v)


class RefreshRequest(Schema):
    refresh_token: str = Field(..., alias="refreshToken")


class GoogleAuthRequest(Schema):
    id_token: Optional[str] = Field(default=None, alias="idToken")
    access_token: Optional[str] = Field(default=None, alias="accessToken")
    code: Optional[str] = None
    redirect_uri: Optional[str] = Field(default=None, alias="redirectUri")



class AuthUser(Schema):
    """The user object embedded in an auth response."""

    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    subscription: str = "free"



class AuthResponse(Schema):
    access_token: Optional[str] = ""
    token_type: str = "bearer"
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None
    user: AuthUser
    requires_verification: bool = False
    message: Optional[str] = None
