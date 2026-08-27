"""Lumina API — FastAPI application factory and ASGI entrypoint.

Run with, e.g.::

    uvicorn app.main:app --host 0.0.0.0 --port 8000

Responsibilities wired here (and nowhere else):

* **Logging** is configured before anything else so startup logs are formatted
  and secret-redacted.
* **Lifespan**: on startup the running event loop is captured by the realtime
  connection manager (so worker threads can schedule sends onto it); on shutdown
  the job pool is stopped and the DB connection pool disposed.
* **Middleware**: a request-context middleware assigns/propagates an
  ``X-Request-ID`` correlation id and resets the per-request user id; CORS is
  applied outermost from the configured origins.
* **Errors**: the centralized exception handlers guarantee every response is a
  ``{"error": {...}}`` envelope and no stack trace / internal ever leaks.
* **Routers**: health/readiness at the root; the full versioned API (REST +
  the realtime WebSocket) under ``settings.api_v1_prefix``.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.router import api_router
from app.api.routes import health
from app.core.config import settings
from app.core.database import dispose_engine
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging, get_logger, request_id_ctx, user_id_ctx
from app.core.responses import success
from app.jobs.manager import job_manager
from app.realtime.manager import connection_manager

logger = get_logger(__name__)

_REQUEST_ID_HEADER = "X-Request-ID"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Capture the ASGI loop so background worker threads can push realtime
    # events onto it (see app.realtime.manager.publish_threadsafe).
    connection_manager.bind_loop(asyncio.get_running_loop())
    logger.info(
        "%s v%s starting (env=%s, prefix=%s)",
        settings.app_name,
        __version__,
        settings.app_env,
        settings.api_v1_prefix,
    )
    try:
        yield
    finally:
        logger.info("%s shutting down", settings.app_name)
        job_manager.shutdown()
        dispose_engine()


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    configure_logging(settings.log_level, settings.log_json)

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        description=(
            "Backend API for Lumina, an AI-powered learning platform: document "
            "ingestion + RAG, grounded explore chat, generated lessons, the "
            "Concept Crucible assessment, mastery mapping and generated media."
        ),
        lifespan=lifespan,
        openapi_url="/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # -- Request-context middleware (registered first => inner relative to CORS).
    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get(_REQUEST_ID_HEADER) or uuid4().hex
        token_request = request_id_ctx.set(request_id)
        # Reset any user id from a recycled thread; the auth dependency sets the
        # real one once the caller is verified.
        token_user = user_id_ctx.set(None)
        try:
            response = await call_next(request)
            response.headers[_REQUEST_ID_HEADER] = request_id
            return response
        finally:
            request_id_ctx.reset(token_request)
            user_id_ctx.reset(token_user)

    # -- CORS (registered last => outermost, so it also decorates error responses).
    allow_all = "*" in settings.cors_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all else settings.cors_origins,
        # "*" origins are incompatible with credentialed requests; Lumina uses
        # bearer tokens (not cookies) so credentials are not required there.
        allow_credentials=not allow_all,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[_REQUEST_ID_HEADER],
    )

    # -- Errors: consistent envelopes, never leak internals.
    register_exception_handlers(app)

    # -- Routes.
    @app.get("/", include_in_schema=False)
    def root():
        return success(
            {"service": settings.app_name, "version": __version__, "docs": "/docs"}
        )

    app.include_router(health.router)  # /health, /health/ready at the root
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    return app


app = create_app()
