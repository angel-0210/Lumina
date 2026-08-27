"""Versioned API router.

Aggregates every resource router into a single ``api_router`` that
:mod:`app.main` mounts under :data:`settings.api_v1_prefix` (``/api/v1``). The
WebSocket route is included here too, so realtime lives at
``/api/v1/realtime/ws`` alongside the REST surface. Health/readiness is mounted
separately at the application root (see :mod:`app.main`).
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import (
    auth,
    crucible,
    dashboard,
    documents,
    explore,
    jobs,
    learning,
    mastery,
    media,
    profile,
    realtime,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(profile.router)
api_router.include_router(documents.router)
api_router.include_router(learning.topics_router)
api_router.include_router(learning.lessons_router)
api_router.include_router(explore.router)
api_router.include_router(crucible.router)
api_router.include_router(mastery.router)
api_router.include_router(dashboard.router)
api_router.include_router(media.router)
api_router.include_router(jobs.router)
api_router.include_router(realtime.router)
