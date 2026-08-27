"""Shared schema base and common DTOs."""

from __future__ import annotations

from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class Schema(BaseModel):
    """Base model for all DTOs.

    ``from_attributes`` lets us build DTOs from row mappings / objects;
    ``populate_by_name`` allows constructing by field name even when aliases
    are declared.
    """

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class PageMeta(Schema):
    page: int
    page_size: int
    total: Optional[int] = None
    total_pages: Optional[int] = None
    has_more: Optional[bool] = None


class MessageResponse(Schema):
    """Generic acknowledgement payload."""

    message: str
