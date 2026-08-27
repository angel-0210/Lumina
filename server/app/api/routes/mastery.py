"""Mastery routes: the Understanding Map.

Aggregates concept scores (written by the Concept Crucible) into a per-subject
summary and a per-topic concept graph. All reads are scoped to the caller.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbConn
from app.core.responses import success
from app.services import mastery_service

router = APIRouter(prefix="/mastery", tags=["mastery"])


@router.get("/summary")
def get_summary(principal: CurrentUser, conn: DbConn):
    """Return the per-subject mastery summary."""
    return success(mastery_service.get_summary(conn, principal))


@router.get("/map/{topic_id}")
def get_map(topic_id: str, principal: CurrentUser, conn: DbConn):
    """Return the concept map (with prerequisite chain) for a topic."""
    return success(mastery_service.get_map(conn, principal, topic_id))
