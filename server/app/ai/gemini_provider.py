"""Gemini provider — text generation and embeddings over the REST API.

Synchronous ``httpx`` client. The whole request path is synchronous and FastAPI
runs the route handlers in a threadpool, so blocking network calls here do not
block the event loop. The API key is sent in the ``x-goog-api-key`` header (not
the URL) so it never lands in request logs.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.core.exceptions import ProviderError, ServiceUnavailableError
from app.core.logging import get_logger
from .base import EmbeddingResult, GenerationResult, estimate_tokens

logger = get_logger(__name__)

_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
_TIMEOUT = 60.0
_IMAGE_TIMEOUT = 120.0


def _require_key() -> str:
    if not settings.gemini_configured:
        raise ServiceUnavailableError("Gemini is not configured (GEMINI_API_KEY missing).")
    return settings.gemini_api_key  # type: ignore[return-value]


def _headers(api_key: str) -> dict[str, str]:
    return {"x-goog-api-key": api_key, "Content-Type": "application/json"}


def generate_text(
    *,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.4,
    max_output_tokens: int = 2048,
    json_mode: bool = False,
    model: Optional[str] = None,
) -> GenerationResult:
    api_key = _require_key()
    model = model or settings.gemini_model
    url = f"{_BASE_URL}/models/{model}:generateContent"

    generation_config: dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_output_tokens,
    }
    if json_mode:
        generation_config["responseMimeType"] = "application/json"

    body = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": generation_config,
    }

    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(url, headers=_headers(api_key), json=body)
    except httpx.HTTPError as exc:
        logger.warning("gemini generate transport error: %s", exc)
        raise ServiceUnavailableError("Unable to reach the AI service.") from exc

    if resp.status_code >= 400:
        logger.warning("gemini generate returned %s", resp.status_code)
        raise ProviderError("The AI service returned an error.")

    data = resp.json()
    text = _extract_text(data)
    usage = data.get("usageMetadata", {}) or {}
    input_tokens = int(usage.get("promptTokenCount") or estimate_tokens(system_prompt + user_prompt))
    output_tokens = int(usage.get("candidatesTokenCount") or estimate_tokens(text))
    return GenerationResult(
        text=text,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        model=model,
        raw=data,
    )


def _extract_text(data: dict[str, Any]) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        feedback = data.get("promptFeedback", {})
        if feedback.get("blockReason"):
            raise ProviderError("The AI response was blocked by a safety filter.")
        return ""
    parts = (candidates[0].get("content") or {}).get("parts") or []
    return "".join(p.get("text", "") for p in parts).strip()


def embed_texts(
    texts: list[str],
    *,
    task_type: str = "RETRIEVAL_DOCUMENT",
    model: Optional[str] = None,
    dim: Optional[int] = None,
) -> EmbeddingResult:
    """Batch-embed texts at the configured dimensionality (default 1536)."""
    if not texts:
        return EmbeddingResult(embeddings=[], model=model or settings.gemini_embedding_model, dim=0)

    api_key = _require_key()
    model = model or settings.gemini_embedding_model
    dim = dim or settings.embedding_dim
    url = f"{_BASE_URL}/models/{model}:batchEmbedContents"

    requests = [
        {
            "model": f"models/{model}",
            "content": {"parts": [{"text": t}]},
            "taskType": task_type,
            "outputDimensionality": dim,
        }
        for t in texts
    ]

    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(url, headers=_headers(api_key), json={"requests": requests})
    except httpx.HTTPError as exc:
        logger.warning("gemini embed transport error: %s", exc)
        raise ServiceUnavailableError("Unable to reach the embedding service.") from exc

    if resp.status_code >= 400:
        logger.warning("gemini embed returned %s", resp.status_code)
        raise ProviderError("The embedding service returned an error.")

    data = resp.json()
    embeddings = [e.get("values", []) for e in data.get("embeddings", [])]
    return EmbeddingResult(embeddings=embeddings, model=model, dim=dim)


def embed_query(query: str, *, dim: Optional[int] = None) -> list[float]:
    result = embed_texts([query], task_type="RETRIEVAL_QUERY", dim=dim)
    return result.embeddings[0] if result.embeddings else []


@dataclass
class ImageResult:
    image_bytes: bytes
    mime_type: str = "image/png"
def generate_image(
    prompt: str,
    *,
    aspect_ratio: str = "1:1",
    model: Optional[str] = None,
) -> ImageResult:
    """Generate an image using Gemini's multimodal `generateContent` endpoint.

    The Gemini image model (default from settings) returns the image as inlineBase64 data.
    The function decodes the data and returns an ``ImageResult`` containing the raw bytes
    and MIME type.
    """
    api_key = _require_key()
    model = model or settings.gemini_image_model
    # Validate prompt
    if not prompt or not prompt.strip():
        raise ProviderError("Image generation requires a non‑empty prompt.")
    # Use the generateContent endpoint for image generation.
    url = f"{_BASE_URL}/models/{model}:generateContent"
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {"aspectRatio": aspect_ratio},
        },
    }

    try:
        with httpx.Client(timeout=_IMAGE_TIMEOUT) as client:
            resp = client.post(url, headers=_headers(api_key), json=body)
    except httpx.HTTPError as exc:
        logger.warning("gemini image generate transport error: %s", exc)
        raise ServiceUnavailableError("Unable to reach the image service.") from exc

    if resp.status_code >= 400:
        # Extract detailed error information if available
        try:
            err = resp.json().get("error", {})
            code = err.get("code")
            status = err.get("status")
            message = err.get("message")
            detail = f"code={code}, status={status}, message={message}" if any([code, status, message]) else resp.text
        except Exception:
            detail = resp.text
        logger.warning(
            "gemini image generate returned %s: %s", resp.status_code, detail
        )
        raise ProviderError(
            f"Gemini image generation failed with HTTP status {resp.status_code}: {detail}"
        )

    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise ProviderError("Gemini image service returned no candidates.")
    # Look for inlineData containing the image.
    parts = (candidates[0].get("content") or {}).get("parts") or []
    inline = next((p.get("inlineData") for p in parts if p.get("inlineData")), None)
    if not inline:
        raise ProviderError("Gemini image service returned no inline image data.")
    b64 = inline.get("data")
    mime_type = inline.get("mimeType") or "image/png"
    if not b64:
        raise ProviderError("Gemini image service returned empty image data.")
    try:
        raw = base64.b64decode(b64)
    except (ValueError, TypeError) as exc:
        raise ProviderError("Gemini image service returned malformed image data.") from exc
    return ImageResult(image_bytes=raw, mime_type=mime_type)


