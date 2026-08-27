"""Media routes: AI image/video generation + the generated-asset library.

Image and video generation are expensive and slow (Imagen / VEO + a Cloudinary
upload), so both return **202 Accepted** with a job reference and are on the AI
rate-limit budget; the worker hosts the result on Cloudinary and records only
non-secret metadata. The library endpoints are scoped to the caller.

Cloudinary credentials never leave the server — only hosted URLs / public ids
are returned.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query, status

from app.api.deps import AiUser, CurrentUser, DbConn, Pagination
from app.core.responses import paginated, success
from app.schemas.media import ImageGenerateRequest, VideoGenerateRequest
from app.services import media_service

router = APIRouter(prefix="/media", tags=["media"])


@router.post("/images", status_code=status.HTTP_202_ACCEPTED)
def generate_image(req: ImageGenerateRequest, principal: AiUser, conn: DbConn):
    """Enqueue image generation (returns 202 + job)."""
    return success(media_service.generate_image(conn, principal, req))


@router.post("/videos", status_code=status.HTTP_202_ACCEPTED)
def generate_video(req: VideoGenerateRequest, principal: AiUser, conn: DbConn):
    """Enqueue VEO video generation (returns 202 + job)."""
    return success(media_service.generate_video(conn, principal, req))


@router.get("")
def list_assets(
    principal: CurrentUser,
    conn: DbConn,
    page: Pagination,
    lesson_id: Optional[str] = Query(default=None, alias="lessonId"),
):
    """List the caller's generated assets, optionally filtered by lesson."""
    items, total = media_service.list_assets(
        conn, principal, limit=page.limit, offset=page.offset, learning_session_id=lesson_id
    )
    return paginated(items, page=page.page, page_size=page.page_size, total=total)


@router.get("/{asset_id}")
def get_asset(asset_id: str, principal: CurrentUser, conn: DbConn):
    """Return one generated asset."""
    return success(media_service.get_asset(conn, principal, asset_id))


@router.delete("/{asset_id}")
def delete_asset(asset_id: str, principal: CurrentUser, conn: DbConn):
    """Delete a generated asset (and its Cloudinary copy, best-effort)."""
    return success(media_service.delete_asset(conn, principal, asset_id))
