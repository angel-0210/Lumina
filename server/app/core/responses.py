"""Standard API response envelopes.

Every successful response is wrapped as ``{"data": ..., "meta": ...}`` and every
error as ``{"error": {"code": ..., "message": ..., "details": ...}}``. Keeping
this consistent lets the frontend handle all responses uniformly.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class ErrorBody(BaseModel):
    code: str = Field(..., examples=["not_found"])
    message: str = Field(..., examples=["Resource not found"])
    details: Optional[Any] = None


class ErrorEnvelope(BaseModel):
    error: ErrorBody


class Meta(BaseModel):
    """Optional response metadata (pagination, counts, request id, ...)."""

    model_config = {"extra": "allow"}


def success(data: Any, meta: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Build a success envelope."""
    return {"data": data, "meta": meta or {}}


def error(code: str, message: str, details: Any = None) -> dict[str, Any]:
    """Build an error envelope."""
    body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return {"error": body}


def paginated(
    items: list[Any],
    *,
    page: int,
    page_size: int,
    total: Optional[int] = None,
    has_more: Optional[bool] = None,
    extra_meta: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Build a success envelope for a paginated collection."""
    meta: dict[str, Any] = {
        "page": page,
        "page_size": page_size,
    }
    if total is not None:
        meta["total"] = total
        meta["total_pages"] = (total + page_size - 1) // page_size if page_size else 0
    if has_more is None and total is not None:
        has_more = page * page_size < total
    if has_more is not None:
        meta["has_more"] = has_more
    if extra_meta:
        meta.update(extra_meta)
    return {"data": items, "meta": meta}
