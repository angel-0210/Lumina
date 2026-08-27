"""Dashboard / home screen aggregation DTOs."""

from __future__ import annotations

from typing import Optional

from pydantic import Field

from .common import Schema
from .document import DocumentListItem
from .mastery import MasterySummaryItem


class ContinueLearning(Schema):
    """The 'pick up where you left off' card."""

    lesson_id: Optional[str] = Field(default=None, alias="lessonId")
    title: Optional[str] = None
    subject: Optional[str] = None
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    document_id: Optional[str] = Field(default=None, alias="documentId")


class Dashboard(Schema):
    recent_documents: list[DocumentListItem] = Field(default_factory=list, alias="recentDocuments")
    mastery_summary: list[MasterySummaryItem] = Field(default_factory=list, alias="masterySummary")
    continue_learning: Optional[ContinueLearning] = Field(default=None, alias="continueLearning")
    document_count: int = Field(default=0, alias="documentCount")
    topic_count: int = Field(default=0, alias="topicCount")
