"""Dashboard service — the home screen aggregation.

Assembles, in one call: recent documents, the per-subject mastery summary, a
"continue learning" card (the most recent study unit), and headline counts.
Everything is scoped to the caller.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.engine import Connection

from app.core.security import AuthPrincipal
from app.repositories import document_repo, learning_repo
from app.schemas.dashboard import ContinueLearning, Dashboard
from . import document_service, mastery_service

_RECENT_LIMIT = 5


def get_dashboard(conn: Connection, principal: AuthPrincipal) -> Dashboard:
    # Recent documents (reuse the document list-item mapping + topic counts).
    recent_rows = document_repo.recent_for_user(conn, principal.id, limit=_RECENT_LIMIT)
    topic_counts = document_repo.topic_counts(conn, principal.id)
    recent_documents = [
        document_service._to_list_item(r, topics=topic_counts.get(str(r["id"]), 0))
        for r in recent_rows
    ]

    mastery_summary = mastery_service.get_summary(conn, principal)

    document_count = document_repo.count_for_user(conn, principal.id)
    topic_count = learning_repo.count_sessions(conn, principal.id)

    return Dashboard(
        recentDocuments=recent_documents,
        masterySummary=mastery_summary,
        continueLearning=_continue_learning(conn, principal),
        documentCount=document_count,
        topicCount=topic_count,
    )


def _continue_learning(conn: Connection, principal: AuthPrincipal) -> Optional[ContinueLearning]:
    sessions = learning_repo.list_sessions(conn, principal.id, limit=1, offset=0)
    if not sessions:
        return None
    s = sessions[0]
    doc_title = s.get("document_title") or ""
    progress = 1.0 if (s.get("status") or "").lower() == "completed" else 0.0
    return ContinueLearning(
        lessonId=s["id"],
        title=s.get("title") or doc_title or "Lesson",
        subject=doc_title,
        progress=progress,
        documentId=s["document_id"],
    )
