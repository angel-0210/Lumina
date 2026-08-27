"""Profile DTOs."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from .common import Schema


class Profile(Schema):
    id: str
    name: Optional[str] = None
    email: Optional[str] = None
    subscription: str = "free"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ProfileUpdate(Schema):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
