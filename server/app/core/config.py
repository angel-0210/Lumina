"""Application configuration.

Loaded from environment variables (and an optional ``.env`` file via
``python-dotenv``). We intentionally avoid ``pydantic-settings`` because it is a
separate package that is not part of the pinned dependency set; instead we build
a validated ``Settings`` model from ``os.environ``.

Secrets (Supabase / Gemini / Cloudinary / VEO keys) are **optional** at import
time so the application can always boot (e.g. for ``/health`` or running tests).
Endpoints that require a given provider verify configuration at call time and
return ``503 Service Unavailable`` when it is missing, rather than crashing on
startup. Use :meth:`Settings.require` / the ``*_configured`` helpers for that.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Optional

from pydantic import BaseModel, Field, field_validator

try:  # python-dotenv is an installed dependency; guard just in case.
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is optional at runtime
    pass


def _get(key: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(key, default)
    if value is None:
        return None
    value = value.strip()
    return value or default


def _get_bool(key: str, default: bool = False) -> bool:
    raw = _get(key)
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _get_int(key: str, default: int) -> int:
    raw = _get(key)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _get_float(key: str, default: float) -> float:
    raw = _get(key)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _get_list(key: str, default: Optional[list[str]] = None) -> list[str]:
    raw = _get(key)
    if not raw:
        return list(default or [])
    return [item.strip() for item in raw.split(",") if item.strip()]


class Settings(BaseModel):
    """Typed, validated application settings."""

    # -- Application ---------------------------------------------------------
    app_name: str = "Lumina API"
    app_env: str = Field(default="development")  # development | test | production
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"
    log_json: bool = False
    # Comma-separated list of allowed CORS origins.
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "https://lumina-delta-lake.vercel.app",
            "http://localhost:3000",
            "http://localhost:8000",
            "http://localhost:19006",
            "http://localhost:8081",
        ]
    )

    # -- Database (Supabase Postgres) ---------------------------------------
    # e.g. postgresql+psycopg2://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres
    database_url: str = "sqlite:///./lumina_dev.db"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30
    db_pool_recycle: int = 1800
    db_echo: bool = False

    # -- Supabase (Auth + Storage) ------------------------------------------
    supabase_url: Optional[str] = None
    supabase_anon_key: Optional[str] = None
    supabase_service_role_key: Optional[str] = None
    # Legacy HS256 JWT secret used for fast local token verification.
    supabase_jwt_secret: Optional[str] = None
    supabase_jwt_aud: str = "authenticated"
    supabase_storage_bucket: str = "lumina-documents"

    # -- Gemini (text generation + embeddings) ------------------------------
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-3.6-flash"
    gemini_embedding_model: str = "gemini-embedding-001"
    gemini_image_model: str = "gemini-3.1-flash-image"
    embedding_dim: int = 1536

    # -- VEO (video generation) ---------------------------------------------
    veo_enabled: bool = False
    veo_api_key: Optional[str] = None  # falls back to gemini_api_key when unset
    veo_model: str = "veo-3.1-generate-preview"

    # -- Cloudinary (generated media) ---------------------------------------
    cloudinary_cloud_name: Optional[str] = None
    cloudinary_api_key: Optional[str] = None
    cloudinary_api_secret: Optional[str] = None
    cloudinary_upload_folder: str = "lumina"

    # -- RAG tuning ----------------------------------------------------------
    rag_chunk_size: int = 1000  # target characters per chunk
    rag_chunk_overlap: int = 150
    rag_top_k: int = 6
    rag_min_score: float = 0.0  # cosine similarity floor for retrieval
    rag_max_context_chars: int = 12000

    # -- Uploads / limits ----------------------------------------------------
    max_upload_mb: int = 50
    allowed_upload_mime_types: list[str] = Field(
        default_factory=lambda: [
            "application/pdf",
            "text/plain",
            "text/markdown",
            "text/x-markdown",
        ]
    )

    # -- Conversational context ---------------------------------------------
    # How many recent turns to include when building conversational RAG context.
    chat_history_window: int = 8
    crucible_max_turns: int = 5

    # -- Rate limiting (requests per minute, per user) ----------------------
    rate_limit_enabled: bool = True
    rate_limit_default_per_min: int = 120
    # AI/expensive endpoints, keyed by subscription tier.
    ai_rate_limit_free_per_min: int = 60
    ai_rate_limit_pro_per_min: int = 120
    ai_rate_limit_enterprise_per_min: int = 360

    # -- Background jobs (in-process thread pool) ---------------------------
    jobs_max_workers: int = 4
    jobs_retention_minutes: int = 60  # keep finished in-memory jobs this long
    veo_poll_interval_seconds: float = 10.0
    veo_timeout_seconds: float = 600.0

    @field_validator("app_env")
    @classmethod
    def _validate_env(cls, v: str) -> str:
        v = v.lower()
        if v not in {"development", "test", "production"}:
            return "development"
        return v

    # -- Derived helpers -----------------------------------------------------
    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_test(self) -> bool:
        return self.app_env == "test"

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_anon_key)

    @property
    def supabase_admin_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def cloudinary_configured(self) -> bool:
        return bool(
            self.cloudinary_cloud_name
            and self.cloudinary_api_key
            and self.cloudinary_api_secret
        )

    @property
    def veo_configured(self) -> bool:
        return bool(self.veo_enabled and (self.veo_api_key or self.gemini_api_key))

    @property
    def effective_veo_api_key(self) -> Optional[str]:
        return self.veo_api_key or self.gemini_api_key

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    def ai_rate_limit_for_tier(self, tier: str) -> int:
        return {
            "free": self.ai_rate_limit_free_per_min,
            "pro": self.ai_rate_limit_pro_per_min,
            "enterprise": self.ai_rate_limit_enterprise_per_min,
        }.get(tier, self.ai_rate_limit_free_per_min)


def _build_settings() -> Settings:
    return Settings(
        app_name=_get("APP_NAME", "Lumina API"),
        app_env=_get("APP_ENV", "development"),
        debug=_get_bool("DEBUG", False),
        api_v1_prefix=_get("API_V1_PREFIX", "/api/v1"),
        host=_get("HOST", "0.0.0.0"),
        port=_get_int("PORT", 8000),
        log_level=_get("LOG_LEVEL", "INFO"),
        log_json=_get_bool("LOG_JSON", False),
        cors_origins=_get_list(
            "CORS_ORIGINS",
            [
                "https://lumina-delta-lake.vercel.app",
                "http://localhost:3000",
                "http://localhost:8000",
                "http://localhost:19006",
                "http://localhost:8081",
            ],
        ),
        database_url=_normalize_db_url(_get("DATABASE_URL", "sqlite:///./lumina_dev.db")),
        db_pool_size=_get_int("DB_POOL_SIZE", 10),
        db_max_overflow=_get_int("DB_MAX_OVERFLOW", 20),
        db_pool_timeout=_get_int("DB_POOL_TIMEOUT", 30),
        db_pool_recycle=_get_int("DB_POOL_RECYCLE", 1800),
        db_echo=_get_bool("DB_ECHO", False),
        supabase_url=_get("SUPABASE_URL"),
        supabase_anon_key=_get("SUPABASE_ANON_KEY"),
        supabase_service_role_key=_get("SUPABASE_SERVICE_ROLE_KEY"),
        supabase_jwt_secret=_get("SUPABASE_JWT_SECRET"),
        supabase_jwt_aud=_get("SUPABASE_JWT_AUD", "authenticated"),
        supabase_storage_bucket=_get("SUPABASE_STORAGE_BUCKET", "lumina-documents"),
        gemini_api_key=_get("GEMINI_API_KEY"),
        gemini_model=_get("GEMINI_MODEL", "gemini-3.6-flash"),
        gemini_embedding_model=_get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"),
        gemini_image_model=_get("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image"),
        embedding_dim=_get_int("EMBEDDING_DIM", 1536),
        veo_enabled=_get_bool("VEO_ENABLED", False),
        veo_api_key=_get("VEO_API_KEY"),
        veo_model=_get("VEO_MODEL", "veo-3.1-generate-preview"),
        cloudinary_cloud_name=_get("CLOUDINARY_CLOUD_NAME"),
        cloudinary_api_key=_get("CLOUDINARY_API_KEY"),
        cloudinary_api_secret=_get("CLOUDINARY_API_SECRET"),
        cloudinary_upload_folder=_get("CLOUDINARY_UPLOAD_FOLDER", "lumina"),
        rag_chunk_size=_get_int("RAG_CHUNK_SIZE", 1000),
        rag_chunk_overlap=_get_int("RAG_CHUNK_OVERLAP", 150),
        rag_top_k=_get_int("RAG_TOP_K", 6),
        rag_min_score=_get_float("RAG_MIN_SCORE", 0.0),
        rag_max_context_chars=_get_int("RAG_MAX_CONTEXT_CHARS", 12000),
        max_upload_mb=_get_int("MAX_UPLOAD_MB", 50),
        chat_history_window=_get_int("CHAT_HISTORY_WINDOW", 8),
        crucible_max_turns=_get_int("CRUCIBLE_MAX_TURNS", 5),
        rate_limit_enabled=_get_bool("RATE_LIMIT_ENABLED", True),
        rate_limit_default_per_min=_get_int("RATE_LIMIT_DEFAULT_PER_MIN", 120),
        ai_rate_limit_free_per_min=_get_int("AI_RATE_LIMIT_FREE_PER_MIN", 60),
        ai_rate_limit_pro_per_min=_get_int("AI_RATE_LIMIT_PRO_PER_MIN", 120),
        ai_rate_limit_enterprise_per_min=_get_int("AI_RATE_LIMIT_ENTERPRISE_PER_MIN", 360),
        jobs_max_workers=_get_int("JOBS_MAX_WORKERS", 4),
        jobs_retention_minutes=_get_int("JOBS_RETENTION_MINUTES", 60),
        veo_poll_interval_seconds=_get_float("VEO_POLL_INTERVAL_SECONDS", 10.0),
        veo_timeout_seconds=_get_float("VEO_TIMEOUT_SECONDS", 600.0),
    )


def _normalize_db_url(url: Optional[str]) -> str:
    """Ensure a psycopg2 driver is used for plain postgres URLs.

    Supabase connection strings are commonly given as ``postgresql://...`` or
    ``postgres://...``; SQLAlchemy needs an explicit driver for clarity.
    """
    if not url:
        return "sqlite:///./lumina_dev.db"
    if url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://") :]
    return url


@lru_cache
def get_settings() -> Settings:
    """Return a cached, process-wide :class:`Settings` instance."""
    return _build_settings()


settings = get_settings()
