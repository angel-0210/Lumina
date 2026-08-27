"""Media DTOs for Cloudinary-hosted generated assets and VEO video jobs."""

from __future__ import annotations

from typing import Optional

from pydantic import Field

from .common import Schema
from .job import JobRef


class MediaAsset(Schema):
    id: Optional[str] = None
    url: str
    public_id: str = Field(..., alias="publicId")
    kind: str = "image"
    resource_type: str = Field(default="image", alias="resourceType")
    format: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    bytes: Optional[int] = None
    lesson_id: Optional[str] = Field(default=None, alias="lessonId")
    prompt: Optional[str] = None


class VideoGenerateRequest(Schema):
    prompt: str = Field(..., min_length=1, max_length=2000)
    # Optionally ground the video in a lesson/topic (learning_session).
    lesson_id: Optional[str] = Field(default=None, alias="lessonId")
    aspect_ratio: Optional[str] = Field(default="16:9", alias="aspectRatio")


class VideoGenerateResponse(Schema):
    """Returned (HTTP 202) after enqueuing a VEO video generation job."""

    job: JobRef


class ImageGenerateRequest(Schema):
    prompt: str = Field(..., min_length=1, max_length=2000)
    lesson_id: Optional[str] = Field(default=None, alias="lessonId")


class ImageGenerateResponse(Schema):
    """Returned (HTTP 202) after enqueuing an image generation job."""

    job: JobRef
