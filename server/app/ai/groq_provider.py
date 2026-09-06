"""Groq provider — fast text generation over OpenAI-compatible REST API.

Synchronous ``httpx`` client. The whole request path is synchronous and FastAPI
runs the route handlers in a threadpool, so blocking network calls here do not
block the event loop. The API key is sent in the ``Authorization`` header so it
never lands in request logs.
"""

from __future__ import annotations

from typing import Any, Optional

import httpx

from app.core.config import settings
from app.core.exceptions import ProviderError, ServiceUnavailableError
from app.core.logging import get_logger
from .base import GenerationResult, estimate_tokens

logger = get_logger(__name__)

_BASE_URL = "https://api.groq.com/openai/v1"
_TIMEOUT = 60.0


def _require_key() -> str:
    if not settings.groq_configured:
        raise ServiceUnavailableError("Groq is not configured (GROQ_API_KEY missing).")
    return settings.groq_api_key  # type: ignore[return-value]


def _headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def generate_text(
    *,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.4,
    max_output_tokens: int = 2048,
    json_mode: bool = False,
    model: Optional[str] = None,
) -> GenerationResult:
    """Generate text using Groq's OpenAI-compatible API."""
    api_key = _require_key()
    model = model or settings.groq_model
    url = f"{_BASE_URL}/chat/completions"

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_output_tokens,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(url, headers=_headers(api_key), json=body)
    except httpx.HTTPError as exc:
        logger.warning("groq generate transport error: %s", exc)
        raise ServiceUnavailableError("Unable to reach the Groq AI service.") from exc

    if resp.status_code >= 400:
        logger.warning("groq generate returned status %s: %s", resp.status_code, resp.text[:200])
        raise ProviderError(f"The Groq AI service returned status {resp.status_code}.")

    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise ProviderError("Groq AI service returned no response choices.")

    text = (choices[0].get("message") or {}).get("content") or ""
    usage = data.get("usage", {}) or {}
    input_tokens = int(usage.get("prompt_tokens") or estimate_tokens(system_prompt + user_prompt))
    output_tokens = int(usage.get("completion_tokens") or estimate_tokens(text))

    return GenerationResult(
        text=text,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        model=model,
        raw=data,
    )
