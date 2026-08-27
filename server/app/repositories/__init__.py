"""Repository layer (SQLAlchemy Core, ownership-enforced).

Import the modules and call their functions with a live ``Connection``:

    from app.repositories import document_repo
    doc = document_repo.get(conn, document_id, user_id)
"""

from . import (  # noqa: F401
    ai_job_repo,
    assessment_repo,
    audit_repo,
    chunk_repo,
    document_repo,
    job_repo,
    learning_repo,
    mastery_repo,
    media_repo,
    message_repo,
    profile_repo,
)

__all__ = [
    "profile_repo",
    "document_repo",
    "job_repo",
    "ai_job_repo",
    "chunk_repo",
    "learning_repo",
    "message_repo",
    "assessment_repo",
    "mastery_repo",
    "media_repo",
    "audit_repo",
]
