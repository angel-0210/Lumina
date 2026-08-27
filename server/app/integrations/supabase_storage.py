"""Supabase Storage client — upload/download/sign for the documents bucket.

Uses the **service-role key** against the Storage REST API so the backend can
read any object regardless of RLS (ownership is enforced in our own repository
layer before we ever reach for a file). The service-role key is a server secret
and is sent only in server-to-server requests here.

Object keys follow the RLS-friendly convention ``<user_id>/<uuid><ext>`` so that
Supabase's storage policies (which key on the first path segment) also hold as
defense-in-depth.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Optional

import httpx

from app.core.config import settings
from app.core.exceptions import ProviderError, ServiceUnavailableError
from app.core.logging import get_logger

logger = get_logger(__name__)

_TIMEOUT = 30.0

_EXT_BY_MIME = {
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "text/x-markdown": ".md",
}


@dataclass
class StoredObject:
    key: str
    size: int
    content_type: str


def _base_url() -> str:
    if not settings.supabase_url:
        raise ServiceUnavailableError("Supabase is not configured (SUPABASE_URL missing).")
    return settings.supabase_url.rstrip("/") + "/storage/v1"


def _service_key() -> str:
    if not settings.supabase_service_role_key:
        raise ServiceUnavailableError(
            "Storage is not configured (SUPABASE_SERVICE_ROLE_KEY missing)."
        )
    return settings.supabase_service_role_key


def _auth_headers() -> dict[str, str]:
    key = _service_key()
    return {"Authorization": f"Bearer {key}", "apikey": key}


def build_object_key(user_id: str, *, content_type: str, filename: Optional[str] = None) -> str:
    """Compose a per-user object key: ``<user_id>/<uuid><ext>``."""
    ext = _EXT_BY_MIME.get((content_type or "").lower(), "")
    if not ext and filename and "." in filename:
        ext = "." + filename.rsplit(".", 1)[1].lower()
    return f"{user_id}/{uuid.uuid4().hex}{ext}"


def upload_bytes(
    key: str,
    data: bytes,
    *,
    content_type: str,
    upsert: bool = False,
) -> StoredObject:
    """Upload raw bytes to the documents bucket under ``key``."""
    bucket = settings.supabase_storage_bucket
    url = f"{_base_url()}/object/{bucket}/{key}"
    headers = {
        **_auth_headers(),
        "Content-Type": content_type or "application/octet-stream",
        "x-upsert": "true" if upsert else "false",
    }
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(url, headers=headers, content=data)
    except httpx.HTTPError as exc:
        logger.warning("storage upload transport error: %s", exc)
        raise ServiceUnavailableError("Unable to reach file storage.") from exc

    if resp.status_code >= 400:
        logger.warning("storage upload returned %s for key ending %s", resp.status_code, key[-12:])
        raise ProviderError("Failed to store the uploaded file.")
    return StoredObject(key=key, size=len(data), content_type=content_type)


def download_bytes(key: str) -> bytes:
    """Download an object's raw bytes by key (service-role read)."""
    bucket = settings.supabase_storage_bucket
    url = f"{_base_url()}/object/{bucket}/{key}"
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.get(url, headers=_auth_headers())
    except httpx.HTTPError as exc:
        logger.warning("storage download transport error: %s", exc)
        raise ServiceUnavailableError("Unable to reach file storage.") from exc

    if resp.status_code == 404:
        raise ProviderError("The stored file could not be found.")
    if resp.status_code >= 400:
        logger.warning("storage download returned %s for key ending %s", resp.status_code, key[-12:])
        raise ProviderError("Failed to read the stored file.")
    return resp.content


def create_signed_url(key: str, *, expires_in: int = 3600) -> str:
    """Create a time-limited signed URL for client-side download of an object."""
    bucket = settings.supabase_storage_bucket
    url = f"{_base_url()}/object/sign/{bucket}/{key}"
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(
                url, headers=_auth_headers(), json={"expiresIn": expires_in}
            )
    except httpx.HTTPError as exc:
        logger.warning("storage sign transport error: %s", exc)
        raise ServiceUnavailableError("Unable to reach file storage.") from exc

    if resp.status_code >= 400:
        logger.warning("storage sign returned %s", resp.status_code)
        raise ProviderError("Failed to create a download link.")
    signed = resp.json().get("signedURL") or resp.json().get("signedUrl")
    if not signed:
        raise ProviderError("Storage did not return a signed URL.")
    return settings.supabase_url.rstrip("/") + "/storage/v1" + signed


def delete_object(key: str) -> None:
    """Best-effort delete of a stored object (used on hard cleanup)."""
    bucket = settings.supabase_storage_bucket
    url = f"{_base_url()}/object/{bucket}/{key}"
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.delete(url, headers=_auth_headers())
        if resp.status_code >= 400 and resp.status_code != 404:
            logger.warning("storage delete returned %s", resp.status_code)
    except httpx.HTTPError as exc:
        logger.warning("storage delete transport error: %s", exc)
