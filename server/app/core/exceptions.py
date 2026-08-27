"""Application exception hierarchy and FastAPI exception handlers.

All errors surfaced to clients go through these handlers so that responses are
consistent (``{"error": {"code", "message", "details"}}``) and raw Python
exceptions / stack traces are never leaked. Business logic raises the typed
``AppError`` subclasses below; unexpected exceptions are caught by a catch-all
handler that logs the detail server-side and returns a generic 500.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .logging import get_logger
from .responses import error as error_envelope

logger = get_logger(__name__)


class AppError(Exception):
    """Base class for all expected application errors."""

    status_code: int = 500
    code: str = "internal_error"
    message: str = "An unexpected error occurred."

    def __init__(
        self,
        message: Optional[str] = None,
        *,
        code: Optional[str] = None,
        details: Any = None,
        status_code: Optional[int] = None,
    ) -> None:
        self.message = message or self.message
        self.code = code or self.code
        self.details = details
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.message)


class BadRequestError(AppError):
    status_code = 400
    code = "bad_request"
    message = "The request was invalid."


class ValidationAppError(AppError):
    status_code = 422
    code = "validation_error"
    message = "Request validation failed."


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"
    message = "Authentication is required."


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"
    message = "You do not have permission to perform this action."


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"
    message = "The requested resource was not found."


class ConflictError(AppError):
    status_code = 409
    code = "conflict"
    message = "The request conflicts with the current state."


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "payload_too_large"
    message = "The uploaded file is too large."


class UnsupportedMediaTypeError(AppError):
    status_code = 415
    code = "unsupported_media_type"
    message = "The uploaded file type is not supported."


class RateLimitError(AppError):
    status_code = 429
    code = "rate_limited"
    message = "Rate limit exceeded. Please slow down."

    def __init__(self, message: Optional[str] = None, *, retry_after: Optional[int] = None, **kwargs: Any) -> None:
        super().__init__(message, **kwargs)
        self.retry_after = retry_after


class ServiceUnavailableError(AppError):
    status_code = 503
    code = "service_unavailable"
    message = "A required service is not available."


class ProviderError(AppError):
    """Raised when an upstream provider (Gemini/Cloudinary/VEO/Supabase) fails."""

    status_code = 502
    code = "provider_error"
    message = "The service is temporarily unavailable. Please try again shortly."

    def __init__(
        self,
        message: Optional[str] = None,
        *,
        code: Optional[str] = None,
        details: Any = None,
        status_code: Optional[int] = None,
    ) -> None:
        if message:
            logger.warning("Provider error details: %s", message)
        super().__init__(
            message=self.message,
            code=code,
            details=details,
            status_code=status_code,
        )


def _json_error(
    status_code: int,
    code: str,
    message: str,
    details: Any = None,
    headers: Optional[dict[str, str]] = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=error_envelope(code, message, details),
        headers=headers,
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Attach all exception handlers to the FastAPI application."""

    @app.exception_handler(AppError)
    async def _handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        # Client (4xx) errors are expected; log at info. Server (5xx) at error.
        log = logger.info if exc.status_code < 500 else logger.error
        log("app_error code=%s status=%s path=%s", exc.code, exc.status_code, request.url.path)
        headers = None
        if isinstance(exc, RateLimitError) and exc.retry_after is not None:
            headers = {"Retry-After": str(exc.retry_after)}
        return _json_error(exc.status_code, exc.code, exc.message, exc.details, headers)

    @app.exception_handler(RequestValidationError)
    async def _handle_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Surface a compact, safe representation of validation problems.
        details = [
            {
                "loc": list(err.get("loc", [])),
                "msg": err.get("msg", ""),
                "type": err.get("type", ""),
            }
            for err in exc.errors()
        ]
        return _json_error(422, "validation_error", "Request validation failed.", details)

    @app.exception_handler(StarletteHTTPException)
    async def _handle_http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {
            400: "bad_request",
            401: "unauthorized",
            403: "forbidden",
            404: "not_found",
            405: "method_not_allowed",
            409: "conflict",
            413: "payload_too_large",
            415: "unsupported_media_type",
            429: "rate_limited",
            503: "service_unavailable",
        }.get(exc.status_code, "http_error")
        
        # User-friendly mapping for Starlette HTTP exception messages
        message = {
            400: "The request was invalid.",
            401: "Authentication is required.",
            403: "You do not have permission to perform this action.",
            404: "The requested resource was not found.",
            405: "This HTTP method is not allowed.",
            409: "The request conflicts with the current state.",
            413: "The uploaded file is too large.",
            415: "The uploaded file type is not supported.",
            429: "Rate limit exceeded. Please slow down.",
            503: "A required service is not available.",
        }.get(exc.status_code, "Something went wrong while processing your request. Please try again.")
        
        return _json_error(exc.status_code, code, message, headers=getattr(exc, "headers", None))

    @app.exception_handler(Exception)
    async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        # Never leak internals. Log full detail server-side only.
        logger.exception("unhandled_exception path=%s", request.url.path)
        return _json_error(500, "internal_error", "An unexpected error occurred.")

