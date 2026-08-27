"""Explore (grounded RAG chat) DTOs.

The Explore screen renders ChatMessage objects: { id, sender, text, sources? }
where ``sources`` is a list of human-readable strings. We also return richer
``citations`` (with chunk ids / scores) as an additive field for future use.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from .common import Schema


class Citation(Schema):
    """Structured provenance for a retrieved chunk."""

    id: str
    chunk_id: str = Field(..., alias="chunkId")
    document_id: Optional[str] = Field(default=None, alias="documentId")
    document_title: Optional[str] = Field(default=None, alias="documentTitle")
    label: str = Field(default="", description="Human-readable source label")
    score: Optional[float] = None
    snippet: Optional[str] = None
    rank: Optional[int] = None


class ChatMessage(Schema):
    id: str
    sender: Literal["user", "assistant"]
    text: str
    sources: Optional[list[str]] = None
    citations: Optional[list[Citation]] = None
    created_at: Optional[datetime] = Field(default=None, alias="createdAt")


class ExploreQueryRequest(Schema):
    query: str = Field(..., min_length=1, max_length=4000)
    # Restrict retrieval to a single document, or omit to search all the user's docs.
    document_id: Optional[str] = Field(default=None, alias="documentId")
    # Continue an existing explore conversation (a learning_session).
    session_id: Optional[str] = Field(default=None, alias="sessionId")


class ExploreQueryResponse(Schema):
    session_id: str = Field(..., alias="sessionId")
    user_message_id: str = Field(..., alias="userMessageId")
    message: ChatMessage
