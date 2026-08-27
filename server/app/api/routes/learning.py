"""Learning routes: Topics and Lessons.

A ``learning_session`` backs both a Topic and a Lesson (viewed with its ordered
scenes). Listing endpoints accept an optional ``documentId`` filter. Lesson
generation (retrieval + LLM authoring of scenes) is slow, so it returns
**202 Accepted** with a job reference and is on the AI rate-limit budget; the
scenes are attached by the background worker.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query, status

from app.api.deps import AiUser, CurrentUser, DbConn, Pagination
from app.core.responses import paginated, success
from app.schemas.learning import LessonGenerateRequest
from app.services import learning_service

topics_router = APIRouter(prefix="/topics", tags=["topics"])
lessons_router = APIRouter(prefix="/lessons", tags=["lessons"])

DocumentFilter = Query(default=None, alias="documentId", description="Filter by source document")


# --------------------------------------------------------------------------- #
# Topics
# --------------------------------------------------------------------------- #
@topics_router.get("")
def list_topics(
    principal: CurrentUser,
    conn: DbConn,
    page: Pagination,
    document_id: Optional[str] = DocumentFilter,
):
    """List the caller's study units (topics), paginated."""
    items, total = learning_service.list_topics(
        conn, principal, limit=page.limit, offset=page.offset, document_id=document_id
    )
    return paginated(items, page=page.page, page_size=page.page_size, total=total)


@topics_router.get("/{topic_id}")
def get_topic(topic_id: str, principal: CurrentUser, conn: DbConn):
    """Return one topic."""
    return success(learning_service.get_topic(conn, principal, topic_id))


# --------------------------------------------------------------------------- #
# Lessons
# --------------------------------------------------------------------------- #
@lessons_router.get("")
def list_lessons(
    principal: CurrentUser,
    conn: DbConn,
    page: Pagination,
    document_id: Optional[str] = DocumentFilter,
):
    """List the caller's lessons, paginated."""
    items, total = learning_service.list_lessons(
        conn, principal, limit=page.limit, offset=page.offset, document_id=document_id
    )
    return paginated(items, page=page.page, page_size=page.page_size, total=total)


@lessons_router.post("", status_code=status.HTTP_202_ACCEPTED)
def generate_lesson(req: LessonGenerateRequest, principal: AiUser, conn: DbConn):
    """Enqueue grounded scene generation for a document (returns 202 + job)."""
    return success(learning_service.generate_lesson(conn, principal, req))


@lessons_router.get("/{lesson_id}")
def get_lesson(lesson_id: str, principal: CurrentUser, conn: DbConn):
    """Return one lesson with its ordered scenes."""
    return success(learning_service.get_lesson(conn, principal, lesson_id))
