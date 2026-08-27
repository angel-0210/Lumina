"""Health / readiness routes (unauthenticated).

* ``GET /health`` — liveness: the process is up and serving.
* ``GET /health/ready`` — readiness: also probes database connectivity and
  returns 503 when a required dependency is down (so orchestrators can gate
  traffic). Provider configuration (Gemini/Cloudinary/VEO/Supabase) is reported
  as booleans without leaking any secret values.
"""

from __future__ import annotations

from fastapi import APIRouter

from app import __version__
from app.core.config import settings
from app.core.database import check_database
from app.core.exceptions import ServiceUnavailableError
from app.core.responses import success

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    """Liveness probe."""
    return success({"status": "ok", "service": settings.app_name, "version": __version__})


@router.get("/health/ready")
def readiness():
    """Readiness probe: verifies database connectivity."""
    db_ok = check_database()
    if not db_ok:
        raise ServiceUnavailableError("Database is not reachable.")
    return success(
        {
            "status": "ready",
            "database": True,
            "providers": {
                "supabase": settings.supabase_configured,
                "gemini": settings.gemini_configured,
                "cloudinary": settings.cloudinary_configured,
                "veo": settings.veo_configured,
            },
        }
    )
