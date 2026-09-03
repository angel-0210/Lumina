"""Document service — upload, list, detail, processing status, delete.

Uploading stores the raw bytes in Cloudinary (resource_type="raw") and then
enqueues the *slow* work (extract -> chunk -> embed) as a background job,
returning HTTP 202 with a job reference. The heavy RAG ingestion never runs
inline in the request.

Storage layout (Cloudinary):
    folder  : lumina/documents/<user_id>/
    resource_type : raw (served as-is, not transformed)
    file_key      : Cloudinary secure_url  (stored in DB, used for download)
    file_public_id: Cloudinary public_id   (stored in DB, used for deletion)
"""

from __future__ import annotations

from typing import Any, Optional
from urllib.parse import unquote

from sqlalchemy.engine import Connection

from app.core.config import settings
from app.core.exceptions import (
    BadRequestError,
    NotFoundError,
    PayloadTooLargeError,
    UnsupportedMediaTypeError,
)
from app.core.logging import get_logger
from app.core.security import AuthPrincipal
from app.integrations import cloudinary_client
from app.jobs import workers
from app.jobs.manager import job_manager
from app.repositories import document_repo, job_repo, learning_repo, topic_repo
from app.schemas.document import (
    DocumentDetail,
    DocumentListItem,
    DocumentTopicRef,
    ProcessingStatus,
    UploadResponse,
)
from app.schemas.job import JobRef
from app.schemas.common import MessageResponse
from .formatting import human_date, human_size, ingestion_progress, relative_date

logger = get_logger(__name__)

_JOB_KIND = "document_processing"


def _to_list_item(row: dict[str, Any], *, topics: int = 0) -> DocumentListItem:
    return DocumentListItem(
        id=row["id"],
        title=row.get("title") or "Untitled",
        status=row.get("status") or "pending",
        size=human_size(row.get("file_size")),
        date=relative_date(row.get("created_at")),
        topics=topics,
        progress=ingestion_progress(row.get("status")),
        file_type=row.get("file_type"),
        file_size=row.get("file_size"),
        chunk_count=int(row.get("chunk_count") or 0),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


def list_documents(
    conn: Connection, principal: AuthPrincipal, *, limit: int, offset: int, q: Optional[str] = None
) -> tuple[list[DocumentListItem], int]:
    rows = document_repo.list_for_user(conn, principal.id, limit=limit, offset=offset, q=q)
    total = document_repo.count_for_user(conn, principal.id, q=q)
    counts = document_repo.topic_counts(conn, principal.id)
    items = [_to_list_item(r, topics=counts.get(str(r["id"]), 0)) for r in rows]
    return items, total



def get_document(conn: Connection, principal: AuthPrincipal, document_id: str) -> DocumentDetail:
    row = document_repo.get(conn, document_id, principal.id)
    if row is None:
        raise NotFoundError("Document not found.")

    sessions = learning_repo.list_sessions(
        conn, principal.id, limit=100, offset=0, document_id=document_id
    )
    doc_topics = topic_repo.list_topics_for_document(conn, document_id, principal.id)
    topic_desc_map = {t["title"]: t.get("description") for t in doc_topics}

    topics_list = [
        DocumentTopicRef(
            id=s["id"],
            name=s.get("title") or s.get("document_title") or "Study unit",
            desc=topic_desc_map.get(s.get("title") or "") or "",
        )
        for s in sessions
    ]

    base = _to_list_item(row, topics=len(topics_list))
    return DocumentDetail(
        **base.model_dump(by_alias=False),
        uploaded=human_date(row.get("created_at")),
        topicsList=topics_list,
    )


def create_document(
    conn: Connection,
    principal: AuthPrincipal,
    *,
    filename: str,
    content_type: Optional[str],
    data: bytes,
) -> UploadResponse:
    """Validate, store bytes in Cloudinary, register the document and enqueue ingestion."""
    if not data:
        raise BadRequestError("The uploaded file is empty.")

    mime = (content_type or "").split(";")[0].strip().lower()
    # Fall back to extension-based detection when the client omits a usable type.
    if mime not in settings.allowed_upload_mime_types:
        guessed = _guess_mime_from_name(filename)
        if guessed:
            mime = guessed
    if mime not in settings.allowed_upload_mime_types:
        raise UnsupportedMediaTypeError(
            "Unsupported file type. Upload a PDF, text or markdown file."
        )

    if len(data) > settings.max_upload_bytes:
        raise PayloadTooLargeError(
            f"File exceeds the maximum size of {settings.max_upload_mb} MB."
        )

    title = _title_from_filename(filename)

    # Upload to Cloudinary (resource_type=raw) — server-side, signed, never exposed.
    asset = cloudinary_client.upload_document(
        data,
        user_id=principal.id,
        filename=filename,
        content_type=mime,
    )

    doc = document_repo.create(
        conn,
        user_id=principal.id,
        title=title,
        file_key=asset.url,           # secure_url — used for download during ingestion
        file_public_id=asset.public_id,  # public_id — used for deletion
        file_type=mime,
        file_size=len(data),
        status="pending",
    )
    db_job = job_repo.create(conn, document_id=doc["id"], status="pending")

    job_id = job_manager.submit(
        _JOB_KIND,
        workers.ingest_document_job,
        user_id=principal.id,
        entity_id=doc["id"],
        document_id=doc["id"],
        db_job_id=db_job["id"],
        file_key=asset.url,   # secure_url forwarded to the ingestion worker
        file_type=mime,
    )

    logger.info("registered document %s (%d bytes), job %s", doc["id"], len(data), job_id)
    return UploadResponse(
        document=_to_list_item(doc, topics=0),
        job=JobRef(job_id=job_id, status="pending", kind=_JOB_KIND),
    )


def processing_status(
    conn: Connection, principal: AuthPrincipal, document_id: str
) -> ProcessingStatus:
    doc = document_repo.get(conn, document_id, principal.id)
    if doc is None:
        raise NotFoundError("Document not found.")
    job = job_repo.latest_for_document(conn, document_id, principal.id)
    return ProcessingStatus(
        document_id=document_id,
        status=(job or {}).get("status") or doc.get("status") or "pending",
        progress_pct=int((job or {}).get("progress_pct") or 0),
        chunk_count=int(doc.get("chunk_count") or 0),
        error_message=(job or {}).get("error_message"),
    )


def delete_document(
    conn: Connection, principal: AuthPrincipal, document_id: str
) -> MessageResponse:
    """Soft-delete the DB row and best-effort delete the Cloudinary asset."""
    # Fetch file info before soft-deleting so we can attempt Cloudinary cleanup.
    file_info = document_repo.get_file_info(conn, document_id, principal.id)
    if not file_info:
        raise NotFoundError("Document not found.")

    ok = document_repo.soft_delete(conn, document_id, principal.id)
    if not ok:
        raise NotFoundError("Document not found.")

    # Best-effort: delete the raw file from Cloudinary.
    public_id = (file_info or {}).get("file_public_id")
    if public_id:
        try:
            cloudinary_client.delete_document(public_id)
        except Exception:  # noqa: BLE001
            logger.warning(
                "Cloudinary cleanup failed for document %s (public_id=%s)",
                document_id,
                public_id,
                exc_info=True,
            )

    return MessageResponse(message="Document deleted.")


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
_EXT_TO_MIME = {
    "pdf": "application/pdf",
    "txt": "text/plain",
    "md": "text/markdown",
    "markdown": "text/markdown",
}


def _guess_mime_from_name(filename: Optional[str]) -> Optional[str]:
    if not filename or "." not in filename:
        return None
    ext = filename.rsplit(".", 1)[1].lower()
    return _EXT_TO_MIME.get(ext)


def _title_from_filename(filename: Optional[str]) -> str:
    if not filename:
        return "Untitled document"
    # URL-decode encoded characters (e.g. %20 -> space) from file pickers.
    name = unquote(filename)
    name = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if "." in name:
        name = name.rsplit(".", 1)[0]
    name = name.replace("_", " ").replace("-", " ").strip()
    return name[:200] or "Untitled document"
