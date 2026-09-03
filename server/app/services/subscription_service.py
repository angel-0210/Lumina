"""Subscription service — tier status, feature gating, and upgrade handling."""

from __future__ import annotations

from typing import Any
from sqlalchemy.engine import Connection

from app.core.exceptions import BadRequestError, NotFoundError
from app.core.security import AuthPrincipal
from app.repositories import audit_repo, profile_repo
from app.schemas.profile import Profile


TIER_FEATURES = {
    "free": {
        "tier": "free",
        "name": "Free Tier",
        "max_upload_mb": 50,
        "ai_rate_limit_per_min": 60,
        "features": [
            "Unlimited document upload (up to 50MB)",
            "Basic RAG search and explore chat",
            "Concept Crucible assessment (5 turns)",
            "Basic tutorial scene generation",
        ],
    },
    "pro": {
        "tier": "pro",
        "name": "Lumina Pro",
        "max_upload_mb": 100,
        "ai_rate_limit_per_min": 120,
        "features": [
            "Everything in Free Tier",
            "High-priority RAG indexing & hybrid search",
            "Unlimited AI Imagen visual generation",
            "VEO AI video scene animations",
            "Advanced Mastery Analytics & Crucible tracking",
            "Faster AI processing queues",
        ],
    },
    "enterprise": {
        "tier": "enterprise",
        "name": "Lumina Enterprise",
        "max_upload_mb": 500,
        "ai_rate_limit_per_min": 360,
        "features": [
            "Everything in Pro Tier",
            "Custom LLM & embedding configurations",
            "Dedicated high-speed background job workers",
            "Priority support & SLA guarantee",
        ],
    },
}


def get_status(conn: Connection, principal: AuthPrincipal) -> dict[str, Any]:
    """Return user's current subscription status and active tier features."""
    profile_row = profile_repo.get(conn, principal.id)
    if profile_row is None:
        profile_row = profile_repo.upsert(conn, principal.id, email=principal.email)
    
    tier = (profile_row.get("subscription") or "free").lower()
    details = TIER_FEATURES.get(tier, TIER_FEATURES["free"])
    
    return {
        "user_id": principal.id,
        "subscription": tier,
        "is_pro": tier in ("pro", "enterprise"),
        "tier_details": details,
    }


def upgrade_subscription(
    conn: Connection, principal: AuthPrincipal, target_tier: str = "pro"
) -> Profile:
    """Upgrade user subscription tier to Pro or Enterprise."""
    target_tier = target_tier.lower()
    if target_tier not in ("free", "pro", "enterprise"):
        raise BadRequestError("Invalid subscription tier requested.")
    
    updated_row = profile_repo.update_profile(conn, principal.id, subscription=target_tier)
    if updated_row is None:
        raise NotFoundError("Profile not found.")
    
    audit_repo.log_auth_event(conn, user_id=principal.id, action="update")
    return Profile.model_validate(updated_row)
