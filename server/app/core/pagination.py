"""Pagination helpers.

A small, dependency-injectable ``PageParams`` used by list endpoints. Uses
simple page/page_size (offset) pagination which is sufficient for Lumina's data
volumes and matches the frontend's needs.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Query

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


@dataclass
class PageParams:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


def page_params(
    page: int = Query(1, ge=1, description="1-based page number"),
    page_size: int = Query(
        DEFAULT_PAGE_SIZE,
        ge=1,
        le=MAX_PAGE_SIZE,
        description="Items per page",
    ),
) -> PageParams:
    """FastAPI dependency that parses and bounds pagination query params."""
    return PageParams(page=page, page_size=page_size)
