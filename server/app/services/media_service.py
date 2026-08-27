"""Media service — AI image and VEO video generation + generated-asset library.

Generation is expensive and slow (Imagen / VEO round-trips plus a Cloudinary
upload), so both image and video generation are enqueued as background jobs and
return HTTP 202 with a job reference — the HTTP request never blocks on a model.
The worker hosts the result on Cloudinary and records only non-secret metadata
(``public_id`` + URL + dimensions) in ``media_assets``.

Provider configuration is checked up front so callers get a clear ``503`` instead
of a job that is doomed to fail.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.engine import Connection

from app.core.config import settings
from app.core.exceptions import NotFoundError, ServiceUnavailableError
from app.core.logging import get_logger
from app.core.security import AuthPrincipal
from app.integrations import cloudinary_client
from app.jobs import workers
from app.jobs.manager import job_manager
from app.repositories import learning_repo, media_repo
from app.schemas.common import MessageResponse
from app.schemas.job import JobRef
from app.schemas.media import (
    ImageGenerateRequest,
    ImageGenerateResponse,
    MediaAsset,
    VideoGenerateRequest,
    VideoGenerateResponse,
)

logger = get_logger(__name__)

_IMAGE_JOB_KIND = "image_generation"
_VIDEO_JOB_KIND = "video_generation"


# --------------------------------------------------------------------------- #
# mapping
# --------------------------------------------------------------------------- #
def _to_asset(row: dict[str, Any]) -> MediaAsset:
    return MediaAsset(
        id=str(row["id"]),
        url=row.get("url") or "",
        publicId=row.get("public_id") or "",
        kind=row.get("kind") or "image",
        resourceType=row.get("resource_type") or "image",
        format=row.get("format"),
        width=row.get("width"),
        height=row.get("height"),
        duration=row.get("duration"),
        bytes=row.get("bytes"),
        lessonId=(str(row["learning_session_id"]) if row.get("learning_session_id") else None),
        prompt=row.get("prompt"),
    )


def _resolve_lesson_document(
    conn: Connection, principal: AuthPrincipal, lesson_id: Optional[str]
) -> Optional[str]:
    """Validate optional lesson ownership; return its document_id for grounding."""
    if not lesson_id:
        return None
    session = learning_repo.get_session(conn, lesson_id, principal.id)
    if session is None:
        raise NotFoundError("Lesson not found.")
    return session.get("document_id")


# --------------------------------------------------------------------------- #
# generation (async)
# --------------------------------------------------------------------------- #
def generate_image(
    conn: Connection, principal: AuthPrincipal, req: ImageGenerateRequest
) -> ImageGenerateResponse:
    if not settings.gemini_configured:
        raise ServiceUnavailableError("Image generation is not configured.")
    if not settings.cloudinary_configured:
        raise ServiceUnavailableError("Media hosting is not configured.")

    document_id = _resolve_lesson_document(conn, principal, req.lesson_id)
    job_id = job_manager.submit(
        _IMAGE_JOB_KIND,
        workers.generate_image_job,
        user_id=principal.id,
        entity_id=req.lesson_id,
        prompt=req.prompt,
        lesson_id=req.lesson_id,
        document_id=document_id,
    )
    logger.info("enqueued image generation, job %s", job_id)
    return ImageGenerateResponse(
        job=JobRef(job_id=job_id, status="pending", kind=_IMAGE_JOB_KIND)
    )


def generate_video(
    conn: Connection, principal: AuthPrincipal, req: VideoGenerateRequest
) -> VideoGenerateResponse:
    if not settings.veo_configured:
        raise ServiceUnavailableError("Video generation is not configured.")
    if not settings.cloudinary_configured:
        raise ServiceUnavailableError("Media hosting is not configured.")

    document_id = _resolve_lesson_document(conn, principal, req.lesson_id)
    job_id = job_manager.submit(
        _VIDEO_JOB_KIND,
        workers.generate_video_job,
        user_id=principal.id,
        entity_id=req.lesson_id,
        prompt=req.prompt,
        aspect_ratio=req.aspect_ratio or "16:9",
        lesson_id=req.lesson_id,
        document_id=document_id,
    )
    logger.info("enqueued video generation, job %s", job_id)
    return VideoGenerateResponse(
        job=JobRef(job_id=job_id, status="pending", kind=_VIDEO_JOB_KIND)
    )


# --------------------------------------------------------------------------- #
# library reads / delete
# --------------------------------------------------------------------------- #
def list_assets(
    conn: Connection,
    principal: AuthPrincipal,
    *,
    limit: int,
    offset: int,
    learning_session_id: Optional[str] = None,
) -> tuple[list[MediaAsset], int]:
    rows = media_repo.list_for_user(
        conn, principal.id, limit=limit, offset=offset, learning_session_id=learning_session_id
    )
    total = media_repo.count_for_user(
        conn, principal.id, learning_session_id=learning_session_id
    )
    return [_to_asset(r) for r in rows], total


def get_asset(conn: Connection, principal: AuthPrincipal, asset_id: str) -> MediaAsset:
    row = media_repo.get(conn, asset_id, principal.id)
    if row is None:
        raise NotFoundError("Media asset not found.")
    return _to_asset(row)


def delete_asset(
    conn: Connection, principal: AuthPrincipal, asset_id: str
) -> MessageResponse:
    row = media_repo.get(conn, asset_id, principal.id)
    if row is None:
        raise NotFoundError("Media asset not found.")

    # Best-effort removal from Cloudinary (never blocks the DB delete).
    if settings.cloudinary_configured and row.get("public_id"):
        try:
            cloudinary_client.delete_media(
                row["public_id"], resource_type=row.get("resource_type") or "image"
            )
        except Exception:  # noqa: BLE001 - hosting cleanup is best-effort
            logger.warning("failed to delete cloudinary asset for %s", asset_id)

    media_repo.delete(conn, asset_id, principal.id)
    return MessageResponse(message="Media deleted.")
