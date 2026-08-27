"""Explore service — grounded RAG chat (interactive request/response).

A single Explore turn = retrieve -> assemble context -> one grounded generation.
This is a conversational interaction the UI expects inline, so it is synchronous
(bounded by the provider timeout) rather than a background job; the genuinely
long-running AI work (lesson scenes, video) is what runs async.

Every turn is persisted to ``session_messages`` (role/phase: user=question,
assistant=answer) and the grounding chunks are recorded in ``message_retrievals``
so answers keep their provenance. Retrieval is always scoped to the caller's own
documents.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.engine import Connection

from app.ai import ai_service
from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.core.logging import get_logger
from app.core.security import AuthPrincipal
from app.repositories import document_repo, learning_repo, message_repo
from app.schemas.explore import (
    ChatMessage,
    Citation,
    ExploreQueryRequest,
    ExploreQueryResponse,
)

logger = get_logger(__name__)


def _history_text(conn: Connection, session_id: str) -> str:
    rows = message_repo.recent_messages(conn, session_id, limit=settings.chat_history_window)
    lines: list[str] = []
    for r in rows:
        speaker = "User" if r.get("role") == "user" else "Assistant"
        lines.append(f"{speaker}: {r.get('content') or ''}")
    return "\n".join(lines)


def _resolve_session(
    conn: Connection, principal: AuthPrincipal, req: ExploreQueryRequest
) -> tuple[dict[str, Any], Optional[str]]:
    """Return (session_row, effective_document_id) for the query.

    A learning_session requires a document, so a new Explore conversation must be
    started with a ``document_id``; an existing conversation is continued with a
    ``session_id``.
    """
    if req.session_id:
        session = learning_repo.get_session(conn, req.session_id, principal.id)
        if session is None:
            raise NotFoundError("Conversation not found.")
        document_id = req.document_id or session.get("document_id")
        return session, document_id

    if req.document_id:
        doc = document_repo.get(conn, req.document_id, principal.id)
        if doc is None:
            raise NotFoundError("Document not found.")
        session = learning_repo.create_session(
            conn, user_id=principal.id, document_id=req.document_id, title=None, status="active"
        )
        return session, req.document_id

    raise BadRequestError("Provide a documentId to start a conversation, or a sessionId to continue one.")


def query(
    conn: Connection, principal: AuthPrincipal, req: ExploreQueryRequest
) -> ExploreQueryResponse:
    session, document_id = _resolve_session(conn, principal, req)
    session_id = session["id"]

    history = _history_text(conn, session_id)

    user_msg = message_repo.add_message(
        conn,
        learning_session_id=session_id,
        role="user",
        phase="question",
        content=req.query,
    )

    answer = ai_service.answer_query(
        conn,
        user_id=principal.id,
        query=req.query,
        document_id=document_id,
        history=history,
    )

    assistant_msg = message_repo.add_message(
        conn,
        learning_session_id=session_id,
        role="assistant",
        phase="answer",
        content=answer.text,
        token_count=answer.output_tokens or None,
    )

    if answer.citations:
        retrievals = [
            {
                "chunk_id": c.get("chunk_id"),
                "rank": c.get("rank") or (i + 1),
                "score": c.get("score"),
                "retrieval_method": "hybrid",
            }
            for i, c in enumerate(answer.citations)
            if c.get("chunk_id")
        ]
        message_repo.add_retrievals(conn, assistant_msg["id"], retrievals)

    message = ChatMessage(
        id=assistant_msg["id"],
        sender="assistant",
        text=answer.text,
        sources=answer.sources or None,
        citations=[Citation.model_validate(c) for c in answer.citations] or None,
        createdAt=assistant_msg.get("created_at"),
    )
    return ExploreQueryResponse(
        sessionId=session_id,
        userMessageId=user_msg["id"],
        message=message,
    )


def get_conversation(
    conn: Connection,
    principal: AuthPrincipal,
    session_id: str,
    *,
    limit: int,
    offset: int,
) -> tuple[list[ChatMessage], int]:
    session = learning_repo.get_session(conn, session_id, principal.id)
    if session is None:
        raise NotFoundError("Conversation not found.")

    rows = message_repo.list_messages(
        conn,
        session_id,
        principal.id,
        limit=limit,
        offset=offset,
        phases=["question", "answer"],
        ascending=True,
    )
    total = message_repo.count_messages(
        conn, session_id, principal.id, phases=["question", "answer"]
    )

    messages: list[ChatMessage] = []
    for r in rows:
        sender = "user" if r.get("role") == "user" else "assistant"
        citations = None
        sources = None
        if sender == "assistant":
            rets = message_repo.list_retrievals_for_message(conn, r["id"], principal.id)
            if rets:
                citations = [
                    Citation(
                        id=f"S{idx + 1}",
                        chunkId=ret["chunk_id"],
                        documentId=ret.get("document_id"),
                        documentTitle=ret.get("document_title"),
                        label=_ret_label(ret),
                        score=ret.get("score"),
                        snippet=_ret_snippet(ret.get("content")),
                        rank=ret.get("rank"),
                    )
                    for idx, ret in enumerate(rets)
                ]
                sources = _dedup([c.label for c in citations])
        messages.append(
            ChatMessage(
                id=r["id"],
                sender=sender,
                text=r.get("content") or "",
                sources=sources,
                citations=citations,
                createdAt=r.get("created_at"),
            )
        )
    return messages, total


def _ret_label(ret: dict[str, Any]) -> str:
    title = ret.get("document_title") or "Document"
    idx = ret.get("chunk_index")
    if idx is None:
        return title
    return f"{title} · section {int(idx) + 1}"


def _ret_snippet(content: Optional[str], limit: int = 240) -> Optional[str]:
    if not content:
        return None
    text = " ".join(content.split())
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip() + "…"


def _dedup(labels: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for lbl in labels:
        if lbl and lbl not in seen:
            seen.add(lbl)
            out.append(lbl)
    return out
