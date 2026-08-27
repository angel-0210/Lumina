"""SQLAlchemy Core table objects mirroring ``server/schema.sql``.

Column names, types, nullability and constraints match the live Supabase schema
exactly so the repository layer can build correct SQL. Postgres native enums are
referenced with ``create_type=False`` (they already exist); the ``embedding``
column uses a small custom ``Vector`` type so pgvector's ``vector(1536)`` renders
correctly. We never run ``metadata.create_all`` against production — the schema
is owned by ``schema.sql`` + ``migrations/``.

Note: ``learning_sessions.title`` is added by ``migrations/0001_add_learning_session_title.sql``
(a justified, additive, nullable column) so a generated lesson can carry a title.
"""

from __future__ import annotations

from sqlalchemy import (
    CheckConstraint,
    Column,
    Float,
    Integer,
    MetaData,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB, TIMESTAMP, UUID
from sqlalchemy.types import UserDefinedType

from app.core.config import settings

metadata = MetaData()


class Vector(UserDefinedType):
    """Minimal pgvector column type.

    Values are written/read as raw SQL elsewhere (``'[...]'::vector``); this type
    exists so the table metadata is complete and DDL (if ever emitted) is correct.
    """

    cache_ok = True

    def __init__(self, dim: int | None = None) -> None:
        self.dim = dim

    def get_col_spec(self, **kw: object) -> str:  # noqa: D401
        if settings.database_url.startswith("sqlite"):
            return "TEXT"
        return f"VECTOR({self.dim})" if self.dim else "VECTOR"


# -- Reusable enum types (already created by schema.sql) --------------------
subscription_tier = ENUM(
    "free", "pro", "enterprise", name="subscription_tier", create_type=False
)
document_status = ENUM(
    "pending", "processing", "completed", "failed", name="document_status", create_type=False
)
job_status = ENUM(
    "pending", "processing", "completed", "failed", name="job_status", create_type=False
)
session_status = ENUM("active", "completed", name="session_status", create_type=False)
level_enum = ENUM("Curious", "Student", "Expert", name="level", create_type=False)
visual_type = ENUM(
    "animation", "chart", "diagram", "code", "text", name="visual_type", create_type=False
)
message_role = ENUM("user", "assistant", "system", name="message_role", create_type=False)
message_phase = ENUM("question", "answer", "insight", name="message_phase", create_type=False)
assessment_status = ENUM("started", "completed", name="assessment_status", create_type=False)
ai_job_type = ENUM(
    "scene_generation", "question_generation", "grading", name="ai_job_type", create_type=False
)
retrieval_method = ENUM("keyword", "vector", "hybrid", name="retrieval_method", create_type=False)
audit_action = ENUM(
    "insert", "update", "delete", "login", "logout", name="audit_action", create_type=False
)


def _uuid_pk() -> Column:
    return Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))


def _created_at() -> Column:
    return Column("created_at", TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))


def _updated_at() -> Column:
    return Column("updated_at", TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))


profiles = Table(
    "profiles",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("name", Text),
    Column("email", Text),
    Column("subscription", subscription_tier, nullable=False, server_default=text("'free'")),
    _created_at(),
    _updated_at(),
    Column("deleted_at", TIMESTAMP(timezone=True)),
)

documents = Table(
    "documents",
    metadata,
    _uuid_pk(),
    Column("user_id", UUID(as_uuid=True), nullable=False),
    Column("title", Text, nullable=False),
    # file_key stores the Cloudinary secure_url for the uploaded document.
    # The ingestion pipeline downloads raw bytes from this URL.
    Column("file_key", Text, nullable=False),
    # file_public_id stores the Cloudinary public_id used to delete the asset.
    # Nullable: documents uploaded before migration 0004 will have NULL here.
    Column("file_public_id", Text, nullable=True),
    Column("file_type", Text, nullable=False),
    Column("file_size", Integer, nullable=False),
    Column("chunk_count", Integer, nullable=False, server_default=text("0")),
    Column("status", document_status, nullable=False, server_default=text("'pending'")),
    _created_at(),
    _updated_at(),
    Column("deleted_at", TIMESTAMP(timezone=True)),
    CheckConstraint("file_size > 0", name="documents_file_size_check"),
    CheckConstraint("chunk_count >= 0", name="documents_chunk_count_check"),
)

document_processing_jobs = Table(
    "document_processing_jobs",
    metadata,
    _uuid_pk(),
    Column("document_id", UUID(as_uuid=True), nullable=False),
    Column("status", job_status, nullable=False, server_default=text("'pending'")),
    Column("progress_pct", Integer, nullable=False, server_default=text("0")),
    Column("retry_count", Integer, nullable=False, server_default=text("0")),
    Column("error_message", Text),
    _created_at(),
    _updated_at(),
)

document_chunks = Table(
    "document_chunks",
    metadata,
    _uuid_pk(),
    Column("document_id", UUID(as_uuid=True), nullable=False),
    Column("content", Text, nullable=False),
    Column("embedding", Vector(1536)),
    Column("chunk_index", Integer, nullable=False),
    Column("chunk_hash", Text, nullable=False),
    Column("token_count", Integer),
    _created_at(),
    UniqueConstraint("document_id", "chunk_index", name="doc_chunk_index_unique"),
    UniqueConstraint("document_id", "chunk_hash", name="doc_chunk_hash_unique"),
)

learning_sessions = Table(
    "learning_sessions",
    metadata,
    _uuid_pk(),
    Column("user_id", UUID(as_uuid=True), nullable=False),
    Column("document_id", UUID(as_uuid=True), nullable=False),
    Column("status", session_status, nullable=False, server_default=text("'active'")),
    # Added by migration 0001 (nullable, additive) to carry a generated lesson title.
    Column("title", Text),
    _created_at(),
    _updated_at(),
    Column("deleted_at", TIMESTAMP(timezone=True)),
)

tutorial_scenes = Table(
    "tutorial_scenes",
    metadata,
    _uuid_pk(),
    Column("learning_session_id", UUID(as_uuid=True), nullable=False),
    Column("scene_index", Integer, nullable=False),
    Column("title", Text, nullable=False),
    Column("narration", Text, nullable=False),
    Column("visual_type", visual_type, nullable=False),
    Column("visual_data", JSONB, nullable=False),
    _created_at(),
    UniqueConstraint("learning_session_id", "scene_index", name="scene_index_unique"),
)

session_messages = Table(
    "session_messages",
    metadata,
    _uuid_pk(),
    Column("learning_session_id", UUID(as_uuid=True), nullable=False),
    Column("role", message_role, nullable=False),
    Column("phase", message_phase, nullable=False),
    Column("content", Text, nullable=False),
    Column("token_count", Integer),
    _created_at(),
)

message_retrievals = Table(
    "message_retrievals",
    metadata,
    _uuid_pk(),
    Column("message_id", UUID(as_uuid=True), nullable=False),
    Column("chunk_id", UUID(as_uuid=True), nullable=False),
    Column("rank", Integer, nullable=False),
    Column("score", Float),
    Column("retrieval_method", retrieval_method, nullable=False),
    _created_at(),
    UniqueConstraint("message_id", "chunk_id", name="message_chunk_unique"),
)

ai_generation_jobs = Table(
    "ai_generation_jobs",
    metadata,
    _uuid_pk(),
    Column("learning_session_id", UUID(as_uuid=True), nullable=False),
    Column("message_id", UUID(as_uuid=True)),
    Column("job_type", ai_job_type, nullable=False),
    Column("status", job_status, nullable=False, server_default=text("'pending'")),
    Column("input_token_count", Integer, nullable=False, server_default=text("0")),
    Column("output_token_count", Integer, nullable=False, server_default=text("0")),
    _created_at(),
    _updated_at(),
)

assessment_sessions = Table(
    "assessment_sessions",
    metadata,
    _uuid_pk(),
    Column("learning_session_id", UUID(as_uuid=True), nullable=False),
    Column("user_id", UUID(as_uuid=True), nullable=False),
    Column("status", assessment_status, nullable=False, server_default=text("'started'")),
    # Added by migration 0003 (additive) so a multi-turn Crucible keeps its chosen
    # difficulty (maps to the existing `level` enum) across follow-up questions.
    Column("level", level_enum, nullable=False, server_default=text("'Curious'")),
    Column("started_at", TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")),
    Column("completed_at", TIMESTAMP(timezone=True)),
    UniqueConstraint("learning_session_id", name="assessment_learning_session_unique"),
)

concept_scores = Table(
    "concept_scores",
    metadata,
    _uuid_pk(),
    Column("assessment_session_id", UUID(as_uuid=True), nullable=False),
    Column("concept_name", Text, nullable=False),
    Column("score", Integer, nullable=False),
    Column("mastery", Integer, nullable=False),
    Column("evidence", Text),
    _created_at(),
    UniqueConstraint("assessment_session_id", "concept_name", name="assessment_concept_unique"),
)

audit_logs = Table(
    "audit_logs",
    metadata,
    _uuid_pk(),
    Column("user_id", UUID(as_uuid=True)),
    Column("action", audit_action, nullable=False),
    Column("entity_type", Text, nullable=False),
    Column("entity_id", UUID(as_uuid=True), nullable=False),
    Column("old_state", JSONB),
    Column("new_state", JSONB),
    _created_at(),
)

# Added by migration 0002 (additive) to persist AI-generated media hosted on
# Cloudinary. Stores only non-secret, client-safe metadata (public_id + URL +
# dimensions); Cloudinary credentials never touch the database.
media_assets = Table(
    "media_assets",
    metadata,
    _uuid_pk(),
    Column("user_id", UUID(as_uuid=True), nullable=False),
    Column("learning_session_id", UUID(as_uuid=True)),
    Column("kind", Text, nullable=False, server_default=text("'image'")),
    Column("provider", Text, nullable=False, server_default=text("'cloudinary'")),
    Column("resource_type", Text, nullable=False, server_default=text("'image'")),
    Column("public_id", Text, nullable=False),
    Column("url", Text, nullable=False),
    Column("format", Text),
    Column("width", Integer),
    Column("height", Integer),
    Column("duration", Float),
    Column("bytes", Integer),
    Column("prompt", Text),
    _created_at(),
)
