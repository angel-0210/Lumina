"""Document DTOs.

Field names mirror the frontend mock shapes so screens wire up with minimal
change:

    list item : { id, title, size(str), date(str), topics(int), progress, status }
    detail    : + { topics: [{id, name, desc}], uploaded(str) }

Raw values (file_size bytes, ISO timestamps, chunk_count) are included alongside
the pre-formatted display strings for flexibility.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from .common import Schema
from .job import JobRef


class DocumentTopicRef(Schema):
    """A study unit (learning_session) surfaced under a document."""

    id: str
    name: str
    desc: str = ""


class DocumentBase(Schema):
    id: str
    title: str
    status: str
    # Pre-formatted display fields expected by the UI.
    size: str = Field(default="", description="Human-readable size, e.g. '2.4 MB'")
    date: str = Field(default="", description="Human-readable date")
    topics: int = Field(default=0, description="Count of study units derived from the document")
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    # Raw values.
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    chunk_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DocumentListItem(DocumentBase):
    pass


class DocumentDetail(DocumentBase):
    uploaded: str = ""
    topics_list: list[DocumentTopicRef] = Field(default_factory=list, alias="topicsList")
    # Note: the display array the UI renders as "topics" of a document.


class UploadResponse(Schema):
    """Returned (HTTP 202) after a document is registered and processing enqueued."""

    document: DocumentListItem
    job: JobRef


class ProcessingStatus(Schema):
    document_id: str
    status: str
    progress_pct: int = 0
    chunk_count: int = 0
    error_message: Optional[str] = None
