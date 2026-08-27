"""Lumina backend application package.

Lumina is an AI-powered learning platform. This package implements a modular
monolith FastAPI backend organized in clear layers:

    api/            -> HTTP + WebSocket entrypoints (thin, no business logic)
    schemas/        -> Pydantic request/response DTOs (the public contract)
    services/       -> application / domain services (business logic)
    repositories/   -> data access (SQLAlchemy Core against Supabase Postgres)
    ai/             -> AI orchestration, provider abstractions and the RAG pipeline
    workers/        -> asynchronous background job runners
    core/           -> cross-cutting concerns (config, db, security, errors, ...)
    models/         -> SQLAlchemy Core table definitions mirroring schema.sql
"""

__version__ = "1.0.0"
