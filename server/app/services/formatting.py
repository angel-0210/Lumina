"""Presentation helpers shared across services (display strings, progress math).

Keeps human-facing formatting (sizes, dates, progress fractions) in one place so
DTO mapping stays consistent between the dashboard, document list and detail.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

_STATUS_PROGRESS = {
    "pending": 0.0,
    "processing": 0.5,
    "completed": 1.0,
    "failed": 0.0,
}


def human_size(num_bytes: Optional[int]) -> str:
    """Render a byte count as a compact human string (e.g. '2.4 MB')."""
    if not num_bytes or num_bytes <= 0:
        return "0 B"
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            if unit == "B":
                return f"{int(size)} {unit}"
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def _coerce_dt(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def human_date(value: Any) -> str:
    """Render a timestamp as 'Mon DD, YYYY'. Empty string if unparseable."""
    dt = _coerce_dt(value)
    if dt is None:
        return ""
    return dt.strftime("%b %d, %Y")


def relative_date(value: Any) -> str:
    """Coarse relative date ('Today', 'Yesterday', 'N days ago', else absolute)."""
    dt = _coerce_dt(value)
    if dt is None:
        return ""
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta_days = (now.date() - dt.date()).days
    if delta_days <= 0:
        return "Today"
    if delta_days == 1:
        return "Yesterday"
    if delta_days < 7:
        return f"{delta_days} days ago"
    return dt.strftime("%b %d, %Y")


def ingestion_progress(status: Optional[str]) -> float:
    """Map a document ingestion status to a 0..1 readiness fraction."""
    return _STATUS_PROGRESS.get((status or "").lower(), 0.0)


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def mastery_to_fraction(mastery_0_100: Any) -> float:
    """Convert a stored 0-100 mastery into a 0-1 fraction for the UI."""
    try:
        return clamp01(float(mastery_0_100) / 100.0)
    except (TypeError, ValueError):
        return 0.0
