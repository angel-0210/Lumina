"""Document routes: upload, list, detail, processing status, delete.

Upload stores the raw bytes and returns **202 Accepted** with a job reference;
the heavy RAG ingestion (extract -> chunk -> embed -> store) runs in the
background and is polled via ``/documents/{id}/status`` or the jobs endpoint.
Because ingestion consumes embedding quota, upload is on the AI rate-limit
budget. Every read/delete is scoped to the caller by the service layer.
"""

from __future__ import annotations

from fastapi import APIRouter, File, UploadFile, status

from app.api.deps import AiUser, CurrentUser, DbConn, Pagination
from app.core.responses import paginated, success
from app.services import document_service

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("")
def list_documents(principal: CurrentUser, conn: DbConn, page: Pagination):
    """List the caller's documents (most recent first), paginated."""
    items, total = document_service.list_documents(
        conn, principal, limit=page.limit, offset=page.offset
    )
    return paginated(items, page=page.page, page_size=page.page_size, total=total)


@router.post("", status_code=status.HTTP_202_ACCEPTED)
def upload_document(principal: AiUser, conn: DbConn, file: UploadFile = File(...)):
    """Register an uploaded file and enqueue ingestion (returns 202 + job)."""
    data = file.file.read()
    result = document_service.create_document(
        conn,
        principal,
        filename=file.filename or "document",
        content_type=file.content_type,
        data=data,
    )
    return success(result)


@router.get("/{document_id}")
def get_document(document_id: str, principal: CurrentUser, conn: DbConn):
    """Return one document with its derived study units."""
    return success(document_service.get_document(conn, principal, document_id))


@router.get("/{document_id}/status")
def processing_status(document_id: str, principal: CurrentUser, conn: DbConn):
    """Return ingestion progress/status for a document."""
    return success(document_service.processing_status(conn, principal, document_id))


@router.delete("/{document_id}")
def delete_document(document_id: str, principal: CurrentUser, conn: DbConn):
    """Soft-delete a document owned by the caller."""
    return success(document_service.delete_document(conn, principal, document_id))
