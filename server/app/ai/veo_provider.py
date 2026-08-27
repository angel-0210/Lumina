"""VEO video generation provider (Gemini API long-running operation).

Video generation is slow (tens of seconds to minutes), so this is only ever
invoked from the VEO job worker — never inline in an HTTP request. The provider
exposes three synchronous primitives:

    start_generation() -> operation name
    poll_operation()   -> (done, result|None)
    download_video()   -> raw mp4 bytes (from the returned file URI)

plus ``generate_video_blocking`` which starts + polls to completion for the
worker. The API key travels in the ``x-goog-api-key`` header, never the URL.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.core.exceptions import ProviderError, ServiceUnavailableError
from app.core.logging import get_logger

logger = get_logger(__name__)

_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
_TIMEOUT = 60.0
_DOWNLOAD_TIMEOUT = 120.0


@dataclass
class VeoResult:
    video_bytes: Optional[bytes] = None
    video_uri: Optional[str] = None
    mime_type: str = "video/mp4"


def _require_key() -> str:
    key = settings.effective_veo_api_key
    if not settings.veo_enabled:
        raise ServiceUnavailableError("Video generation is disabled (VEO_ENABLED is false).")
    if not key:
        raise ServiceUnavailableError("Video generation is not configured (no VEO/Gemini API key).")
    return key


def _headers() -> dict[str, str]:
    return {"x-goog-api-key": _require_key(), "Content-Type": "application/json"}


def start_generation(prompt: str, *, aspect_ratio: str = "16:9", model: Optional[str] = None) -> str:
    """Kick off a VEO generation; returns the long-running operation name."""
    model = model or settings.veo_model
    url = f"{_BASE_URL}/models/{model}:predictLongRunning"
    body = {
        "instances": [{"prompt": prompt}],
        "parameters": {"aspectRatio": aspect_ratio},
    }
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(url, headers=_headers(), json=body)
    except httpx.HTTPError as exc:
        logger.warning("veo start transport error: %s", exc)
        raise ServiceUnavailableError("Unable to reach the video service.") from exc

    if resp.status_code >= 400:
        logger.warning("veo start returned %s", resp.status_code)
        raise ProviderError("The video service returned an error.")
    name = resp.json().get("name")
    if not name:
        raise ProviderError("The video service did not return an operation handle.")
    return name


def poll_operation(operation_name: str) -> tuple[bool, Optional[VeoResult]]:
    """Poll a long-running operation once. Returns (done, result-or-None)."""
    url = f"{_BASE_URL}/{operation_name.lstrip('/')}"
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.get(url, headers=_headers())
    except httpx.HTTPError as exc:
        logger.warning("veo poll transport error: %s", exc)
        raise ServiceUnavailableError("Unable to reach the video service.") from exc

    if resp.status_code >= 400:
        logger.warning("veo poll returned %s", resp.status_code)
        raise ProviderError("The video service returned an error while polling.")

    data = resp.json()
    if not data.get("done"):
        return False, None
    if "error" in data:
        message = (data["error"] or {}).get("message", "unknown error")
        logger.warning("veo operation failed: %s", message)
        raise ProviderError("Video generation failed.")
    return True, _parse_result(data.get("response") or {})


def _parse_result(response: dict[str, Any]) -> VeoResult:
    """Extract a video URI (and/or inline bytes) from the operation response.

    The response shape has shifted across preview revisions, so we probe the
    known locations defensively rather than assuming one schema.
    """
    gen = response.get("generateVideoResponse") or response
    samples = (
        gen.get("generatedSamples")
        or gen.get("generatedVideos")
        or gen.get("samples")
        or []
    )
    if samples:
        video = samples[0].get("video") or samples[0]
        uri = video.get("uri") or video.get("videoUri")
        if uri:
            return VeoResult(video_uri=uri)
        inline = video.get("videoBytes") or video.get("bytesBase64Encoded")
        if inline:
            import base64

            return VeoResult(video_bytes=base64.b64decode(inline))
    raise ProviderError("The video service returned no usable video.")


def download_video(uri: str) -> bytes:
    """Download the generated video bytes from a Files API URI."""
    try:
        with httpx.Client(timeout=_DOWNLOAD_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(uri, headers={"x-goog-api-key": _require_key()})
    except httpx.HTTPError as exc:
        logger.warning("veo download transport error: %s", exc)
        raise ServiceUnavailableError("Unable to download the generated video.") from exc
    if resp.status_code >= 400:
        logger.warning("veo download returned %s", resp.status_code)
        raise ProviderError("Failed to download the generated video.")
    return resp.content


def generate_video_blocking(
    prompt: str,
    *,
    aspect_ratio: str = "16:9",
    poll_interval: float = 10.0,
    timeout: float = 600.0,
) -> VeoResult:
    """Start a generation and block (polling) until it completes or times out.

    Intended for the VEO worker thread. Resolves any file URI into actual bytes
    so the worker can hand them to Cloudinary.
    """
    operation = start_generation(prompt, aspect_ratio=aspect_ratio)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        done, result = poll_operation(operation)
        if done and result is not None:
            if result.video_uri and not result.video_bytes:
                result.video_bytes = download_video(result.video_uri)
            return result
        time.sleep(poll_interval)
    raise ProviderError("Video generation timed out.")
