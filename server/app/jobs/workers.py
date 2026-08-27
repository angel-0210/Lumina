"""Background job workers.

These are the callables the :class:`~app.jobs.manager.JobManager` runs on its
thread pool. They are enqueued by the service layer (which returns HTTP 202) and
never run inline in a request. Each worker receives a
:class:`~app.jobs.manager.JobContext` as its first positional argument and its
domain inputs as keyword arguments that exactly match the ``submit(...)`` call
sites in the services.

Design rules honoured here:

* **Short transactions.** Slow work (downloading, embedding, LLM/VEO calls,
  Cloudinary uploads) happens *outside* any open transaction. Database writes
  are done in brief ``connection_scope()`` blocks that commit immediately, so we
  never hold an "idle in transaction" connection across a multi-second model
  round-trip. The ingestion pipeline is explicitly split into a no-DB *prepare*
  phase and a short *persist* phase for exactly this reason.
* **Durable mirrors.** Jobs that have a DB home (``document_processing_jobs``,
  ``ai_generation_jobs``) mirror their state there so status survives a process
  restart. Purely ephemeral media jobs live only in the in-memory manager and
  surface their result through the job-status endpoint / realtime channel.
* **Ownership.** Workers act on behalf of ``ctx.user_id`` and pass it down to
  retrieval, so any grounding is scoped to the owner's own documents. The
  ``document_id`` handed to a media job is already resolved from an
  ownership-checked lesson by the service layer.
* **Realtime.** Workers only call ``ctx.progress(...)`` / ``ctx.set_result(...)``.
  The manager publishes those (and the terminal completed/failed transitions) to
  the owning user over the WebSocket channel — workers never touch sockets.
* **Safe failures.** Progress mirroring and failure-marking are best-effort and
  never raise; the original error is re-raised so the manager records the job as
  failed (and publishes a safe, generic failure message). User-facing error text
  stored in the DB is always one of our own crafted messages, never a raw
  exception string.
"""

from __future__ import annotations

from typing import Any, Optional

from app.ai import ai_service, gemini_provider, veo_provider
from app.ai.rag.extractor import ExtractionError
from app.ai.rag.ingestion import IngestionError, persist_chunks, prepare_chunks
from app.core.config import settings
from app.core.database import connection_scope
from app.core.exceptions import AppError, ProviderError
from app.core.logging import get_logger
from app.integrations import cloudinary_client
from app.jobs.manager import JobContext
from app.repositories import (
    ai_job_repo,
    chunk_repo,
    document_repo,
    job_repo,
    learning_repo,
    media_repo,
)

logger = get_logger(__name__)

# How much progress must accrue before we mirror it to the DB job row. Keeps the
# number of short transactions during ingestion small (the in-memory manager +
# realtime channel carry the fine-grained updates).
_DB_PROGRESS_STEP = 15


# --------------------------------------------------------------------------- #
# Document ingestion: download -> extract -> chunk -> embed -> store
# --------------------------------------------------------------------------- #
def ingest_document_job(
    ctx: JobContext,
    *,
    document_id: str,
    db_job_id: str,
    file_key: str,
    file_type: Optional[str] = None,
) -> None:
    """Run the real RAG ingestion pipeline for one uploaded document."""
    # Mark processing (short txn) — mirrors state for restart-durability.
    with connection_scope() as conn:
        job_repo.update_progress(conn, db_job_id, status="processing", progress_pct=0)
        document_repo.update_status(conn, document_id, status="processing")
    ctx.progress(2, "Starting document processing")

    # Fine-grained progress goes to the manager/realtime every callback; the DB
    # row is mirrored only at coarse milestones to bound transaction churn.
    last_db_pct = {"v": 0}

    def _on_progress(pct: int, message: str) -> None:
        ctx.progress(pct, message)
        if pct < 100 and pct - last_db_pct["v"] >= _DB_PROGRESS_STEP:
            last_db_pct["v"] = pct
            try:
                with connection_scope() as conn:
                    job_repo.update_progress(conn, db_job_id, progress_pct=pct)
            except Exception:  # noqa: BLE001 - progress mirror is best-effort
                logger.debug("ingestion progress mirror failed", exc_info=True)

    # Prepare (download/extract/chunk/embed) with NO transaction held open.
    try:
        prepared = prepare_chunks(
            file_key=file_key, file_type=file_type, progress_cb=_on_progress
        )
    except (IngestionError, ExtractionError) as exc:
        _fail_ingestion(db_job_id, document_id, str(exc) or "We could not process this document.")
        raise
    except AppError as exc:
        _fail_ingestion(db_job_id, document_id, exc.message)
        raise
    except Exception:
        _fail_ingestion(db_job_id, document_id, "Document processing failed. Please try again.")
        raise

    # Persist + finalize in one short transaction.
    try:
        with connection_scope() as conn:
            persist_chunks(conn, document_id=document_id, rows=prepared.rows)
            chunk_count = chunk_repo.count_for_document(conn, document_id)
            job_repo.update_progress(conn, db_job_id, status="completed", progress_pct=100)
            document_repo.update_status(
                conn, document_id, status="completed", chunk_count=chunk_count
            )
    except AppError as exc:
        _fail_ingestion(db_job_id, document_id, exc.message)
        raise
    except Exception:
        _fail_ingestion(db_job_id, document_id, "Failed to store the processed document.")
        raise

    ctx.set_result(
        {
            "document_id": document_id,
            "chunk_count": chunk_count,
            "embedded_count": prepared.result.embedded_count,
            "page_count": prepared.result.page_count,
        }
    )
    ctx.progress(100, "Document ready")
    logger.info(
        "ingested document %s: %d chunks (%d embedded)",
        document_id,
        prepared.result.chunk_count,
        prepared.result.embedded_count,
    )


def _fail_ingestion(db_job_id: str, document_id: str, message: str) -> None:
    """Best-effort mark of the ingestion job + document as failed (never raises)."""
    try:
        with connection_scope() as conn:
            job_repo.update_progress(conn, db_job_id, status="failed", error_message=message)
            document_repo.update_status(conn, document_id, status="failed")
    except Exception:  # noqa: BLE001 - failure bookkeeping must not mask the cause
        logger.debug("failed to mark ingestion failed for %s", document_id, exc_info=True)


# --------------------------------------------------------------------------- #
# Tutorial scene generation (grounded lesson authoring)
# --------------------------------------------------------------------------- #
def generate_scenes_job(
    ctx: JobContext,
    *,
    session_id: str,
    document_id: str,
    focus: str = "",
    scene_count: int = 5,
    ai_job_id: str,
) -> None:
    """Generate grounded tutorial scenes and attach them to the learning session."""
    with connection_scope() as conn:
        ai_job_repo.update_status(conn, ai_job_id, status="processing")
    ctx.progress(10, "Retrieving document context")

    try:
        # Retrieval + generation are coupled in the AI service; this mirrors the
        # synchronous chat path and runs on the worker thread, off the event loop.
        with connection_scope() as conn:
            result = ai_service.generate_scenes(
                conn,
                user_id=ctx.user_id,
                document_id=document_id,
                focus=focus,
                scene_count=scene_count,
            )
            ctx.progress(80, "Composing lesson scenes")
            scene_rows = [
                {
                    "scene_index": index,
                    "title": scene.title,
                    "narration": scene.narration,
                    "visual_type": scene.visual_type,
                    "visual_data": scene.visual_data,
                }
                for index, scene in enumerate(result.scenes)
            ]
            learning_repo.replace_scenes(conn, session_id, scene_rows)
            if result.title:
                learning_repo.set_title(conn, session_id, result.title)
            ai_job_repo.update_status(
                conn,
                ai_job_id,
                status="completed",
                input_token_count=result.input_tokens,
                output_token_count=result.output_tokens,
            )
    except Exception:
        _fail_ai_job(ai_job_id)
        raise

    ctx.set_result(
        {
            "lesson_id": session_id,
            "title": result.title,
            "scene_count": len(result.scenes),
        }
    )
    ctx.progress(100, "Lesson ready")
    logger.info("generated %d scenes for session %s", len(result.scenes), session_id)


def _fail_ai_job(ai_job_id: str) -> None:
    """Best-effort mark of an AI generation job as failed (never raises)."""
    try:
        with connection_scope() as conn:
            ai_job_repo.update_status(conn, ai_job_id, status="failed")
    except Exception:  # noqa: BLE001
        logger.debug("failed to mark ai job %s failed", ai_job_id, exc_info=True)


# --------------------------------------------------------------------------- #
# AI image generation (Imagen -> Cloudinary)
# --------------------------------------------------------------------------- #
def generate_image_job(
    ctx: JobContext,
    *,
    prompt: str,
    lesson_id: Optional[str] = None,
    document_id: Optional[str] = None,
) -> None:
    """Generate an image, host it on Cloudinary, and record its metadata."""
    ctx.progress(5, "Preparing image prompt")
    grounding = _grounding(ctx.user_id, document_id, prompt)
    final_prompt = ai_service.build_image_prompt(prompt, grounding)

    ctx.progress(30, "Generating image")
    image = gemini_provider.generate_image(final_prompt)

    ctx.progress(70, "Storing media")
    uploaded = cloudinary_client.upload_media(image.image_bytes, resource_type="image")

    with connection_scope() as conn:
        row = media_repo.create(
            conn,
            user_id=ctx.user_id,
            public_id=uploaded.public_id,
            url=uploaded.url,
            kind="image",
            resource_type=uploaded.resource_type or "image",
            learning_session_id=lesson_id,
            format=uploaded.format,
            width=uploaded.width,
            height=uploaded.height,
            bytes=uploaded.bytes,
            prompt=prompt,
        )

    ctx.set_result(_asset_result(row))
    ctx.progress(100, "Image ready")
    logger.info("generated image asset %s", row.get("id"))


# --------------------------------------------------------------------------- #
# VEO video generation (long-running -> Cloudinary)
# --------------------------------------------------------------------------- #
def generate_video_job(
    ctx: JobContext,
    *,
    prompt: str,
    aspect_ratio: str = "16:9",
    lesson_id: Optional[str] = None,
    document_id: Optional[str] = None,
) -> None:
    """Generate a video via VEO (polling to completion), host it, record metadata."""
    ctx.progress(5, "Preparing video prompt")
    grounding = _grounding(ctx.user_id, document_id, prompt)
    final_prompt = ai_service.build_video_prompt(prompt, grounding)

    ctx.progress(20, "Generating video (this can take a few minutes)")
    veo = veo_provider.generate_video_blocking(
        final_prompt,
        aspect_ratio=aspect_ratio or "16:9",
        poll_interval=settings.veo_poll_interval_seconds,
        timeout=settings.veo_timeout_seconds,
    )
    if not veo.video_bytes:
        raise ProviderError("Video generation returned no downloadable content.")

    ctx.progress(75, "Storing video")
    uploaded = cloudinary_client.upload_media(veo.video_bytes, resource_type="video")

    with connection_scope() as conn:
        row = media_repo.create(
            conn,
            user_id=ctx.user_id,
            public_id=uploaded.public_id,
            url=uploaded.url,
            kind="video",
            resource_type=uploaded.resource_type or "video",
            learning_session_id=lesson_id,
            format=uploaded.format,
            width=uploaded.width,
            height=uploaded.height,
            duration=uploaded.duration,
            bytes=uploaded.bytes,
            prompt=prompt,
        )

    ctx.set_result(_asset_result(row))
    ctx.progress(100, "Video ready")
    logger.info("generated video asset %s", row.get("id"))


# --------------------------------------------------------------------------- #
# shared helpers
# --------------------------------------------------------------------------- #
def _grounding(user_id: str, document_id: Optional[str], seed: str) -> str:
    """Fetch numbered-source grounding for a media prompt (scoped to the owner).

    Runs in its own short read transaction so no connection is held during the
    subsequent slow generation/upload. Returns ``""`` when there is no document
    to ground against.
    """
    if not document_id:
        return ""
    try:
        with connection_scope() as conn:
            return ai_service.grounding_for_lesson(
                conn, user_id=user_id, document_id=document_id, seed=seed
            )
    except Exception:  # noqa: BLE001 - grounding is an enhancement, never required
        logger.debug("media grounding lookup failed", exc_info=True)
        return ""


def _asset_result(row: dict[str, Any]) -> dict[str, Any]:
    """Client-safe media descriptor for the job result payload (camelCase)."""
    return {
        "id": str(row.get("id")) if row.get("id") is not None else None,
        "url": row.get("url") or "",
        "publicId": row.get("public_id") or "",
        "kind": row.get("kind") or "image",
        "resourceType": row.get("resource_type") or "image",
        "format": row.get("format"),
        "width": row.get("width"),
        "height": row.get("height"),
        "duration": row.get("duration"),
        "bytes": row.get("bytes"),
        "lessonId": (
            str(row["learning_session_id"]) if row.get("learning_session_id") else None
        ),
    }
