"""SQLAlchemy Core table definitions mirroring ``schema.sql``.

These are used by the repository layer to build queries. ``metadata`` here is a
*reflection* of the already-existing Supabase schema — we never call
``create_all`` in production; the database is provisioned from ``schema.sql`` and
``migrations/``.
"""

from app.models.tables import (  # noqa: F401
    metadata,
    profiles,
    documents,
    document_processing_jobs,
    document_chunks,
    learning_sessions,
    tutorial_scenes,
    session_messages,
    message_retrievals,
    ai_generation_jobs,
    assessment_sessions,
    concept_scores,
    audit_logs,
    media_assets,
)
