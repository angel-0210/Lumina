"""Learning service — Topics, Lessons and Scenes.

A ``learning_session`` backs both a Topic and a Lesson; ``tutorial_scenes`` are
its ordered scenes. Lesson generation is slow (retrieval + LLM), so it is
enqueued as a background job that returns HTTP 202; scenes are attached by the
worker when it finishes.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.engine import Connection

from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.core.logging import get_logger
from app.core.security import AuthPrincipal
from app.jobs import workers
from app.jobs.manager import job_manager
from app.repositories import ai_job_repo, document_repo, learning_repo
from app.schemas.job import JobRef
from app.schemas.learning import (
    Lesson,
    LessonGenerateRequest,
    LessonGenerateResponse,
    LessonListItem,
    Scene,
    Topic,
)

logger = get_logger(__name__)

_JOB_KIND = "scene_generation"


# --------------------------------------------------------------------------- #
# mapping helpers
# --------------------------------------------------------------------------- #
def _visual_hint(visual_type: str, visual_data: Any) -> str:
    vt = (visual_type or "text").lower()
    data = visual_data if isinstance(visual_data, dict) else {}
    if vt == "chart":
        kind = data.get("kind") or data.get("type")
        return f"Chart: {kind}" if kind else "Chart"
    if vt == "code":
        lang = data.get("language") or data.get("lang")
        return f"Code ({lang})" if lang else "Code"
    if vt == "diagram":
        return "Diagram"
    if vt == "animation":
        return "Animation"
    return "Key points"


def _scene_to_dto(row: dict[str, Any]) -> Scene:
    return Scene(
        id=row["id"],
        concept=row.get("title") or "Untitled",
        explanation=row.get("narration") or "",
        visualHint=_visual_hint(row.get("visual_type"), row.get("visual_data")),
        visualType=row.get("visual_type") or "text",
        visualData=row.get("visual_data"),
        index=int(row.get("scene_index") or 0),
    )


def _lesson_progress(status: Optional[str]) -> float:
    return 1.0 if (status or "").lower() == "completed" else 0.0


def _session_to_topic(row: dict[str, Any], *, total_scenes: int) -> Topic:
    doc_title = row.get("document_title") or ""
    return Topic(
        id=row["id"],
        name=row.get("title") or doc_title or "Study unit",
        subject=doc_title,
        desc="",
        lessonsCount=1,
        mastery=0.0,
        documentId=row["document_id"],
        documentTitle=doc_title,
        totalScenes=total_scenes,
        status=row.get("status") or "active",
    )


def _session_to_lesson_item(row: dict[str, Any], *, total_scenes: int) -> LessonListItem:
    doc_title = row.get("document_title") or ""
    return LessonListItem(
        id=row["id"],
        title=row.get("title") or doc_title or "Lesson",
        subject=doc_title,
        currentScene=0,
        totalScenes=total_scenes,
        progress=_lesson_progress(row.get("status")),
        documentId=row["document_id"],
    )


# --------------------------------------------------------------------------- #
# reads
# --------------------------------------------------------------------------- #
def list_topics(
    conn: Connection,
    principal: AuthPrincipal,
    *,
    limit: int,
    offset: int,
    document_id: Optional[str] = None,
) -> tuple[list[Topic], int]:
    rows = learning_repo.list_sessions(
        conn, principal.id, limit=limit, offset=offset, document_id=document_id
    )
    total = learning_repo.count_sessions(conn, principal.id, document_id=document_id)
    counts = learning_repo.scene_counts(conn, [r["id"] for r in rows])
    topics = [_session_to_topic(r, total_scenes=counts.get(str(r["id"]), 0)) for r in rows]
    return topics, total


def list_lessons(
    conn: Connection,
    principal: AuthPrincipal,
    *,
    limit: int,
    offset: int,
    document_id: Optional[str] = None,
) -> tuple[list[LessonListItem], int]:
    rows = learning_repo.list_sessions(
        conn, principal.id, limit=limit, offset=offset, document_id=document_id
    )
    total = learning_repo.count_sessions(conn, principal.id, document_id=document_id)
    counts = learning_repo.scene_counts(conn, [r["id"] for r in rows])
    items = [_session_to_lesson_item(r, total_scenes=counts.get(str(r["id"]), 0)) for r in rows]
    return items, total


def get_topic(conn: Connection, principal: AuthPrincipal, topic_id: str) -> Topic:
    row = learning_repo.get_session_with_document(conn, topic_id, principal.id)
    if row is None:
        raise NotFoundError("Topic not found.")
    total = learning_repo.count_scenes(conn, topic_id)
    return _session_to_topic(row, total_scenes=total)


def get_lesson(conn: Connection, principal: AuthPrincipal, lesson_id: str) -> Lesson:
    row = learning_repo.get_session_with_document(conn, lesson_id, principal.id)
    if row is None:
        raise NotFoundError("Lesson not found.")
    scene_rows = learning_repo.list_scenes(conn, lesson_id)
    scenes = [_scene_to_dto(s) for s in scene_rows]
    doc_title = row.get("document_title") or ""
    return Lesson(
        id=row["id"],
        title=row.get("title") or doc_title or "Lesson",
        subject=doc_title,
        documentId=row["document_id"],
        scenes=scenes,
        currentScene=0,
        totalScenes=len(scenes),
        progress=_lesson_progress(row.get("status")),
        status=row.get("status") or "active",
        created_at=row.get("created_at"),
    )


# --------------------------------------------------------------------------- #
# generation (async)
# --------------------------------------------------------------------------- #
def generate_lesson(
    conn: Connection, principal: AuthPrincipal, req: LessonGenerateRequest
) -> LessonGenerateResponse:
    doc = document_repo.get(conn, req.document_id, principal.id)
    if doc is None:
        raise NotFoundError("Document not found.")
    if (doc.get("status") or "").lower() != "completed" or int(doc.get("chunk_count") or 0) <= 0:
        raise BadRequestError(
            "This document is not ready yet. Wait for processing to finish before "
            "generating a lesson."
        )

    session = learning_repo.create_session(
        conn, user_id=principal.id, document_id=req.document_id, title=None, status="active"
    )
    ai_job = ai_job_repo.create(
        conn, learning_session_id=session["id"], job_type="scene_generation", status="pending"
    )

    scene_count = req.scene_count or 5
    job_id = job_manager.submit(
        _JOB_KIND,
        workers.generate_scenes_job,
        user_id=principal.id,
        entity_id=session["id"],
        session_id=session["id"],
        document_id=req.document_id,
        focus=req.focus or "",
        scene_count=scene_count,
        ai_job_id=ai_job["id"],
    )

    logger.info("enqueued scene generation for session %s, job %s", session["id"], job_id)
    return LessonGenerateResponse(
        lessonId=session["id"],
        job=JobRef(job_id=job_id, status="pending", kind=_JOB_KIND),
    )
