"""Learning DTOs: Topic, Lesson and Scene.

Entity mapping (documented in the implementation report):
    Topic  <-> a learning_session (a study unit derived from a document)
    Lesson <-> the same learning_session, viewed with its ordered scenes
    Scene  <-> a tutorial_scene (concept=title, explanation=narration,
               visualHint derived from visual_type/visual_data)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from .common import Schema
from .job import JobRef


class Scene(Schema):
    id: str
    concept: str = Field(..., description="Scene title / concept name")
    explanation: str = Field(..., description="Scene narration")
    visual_hint: str = Field(default="", alias="visualHint")
    visual_type: str = Field(default="text", alias="visualType")
    visual_data: Optional[Any] = Field(default=None, alias="visualData")
    index: int = 0


class Topic(Schema):
    id: str
    name: str
    subject: str = ""
    desc: str = ""
    lessons_count: int = Field(default=1, alias="lessonsCount")
    mastery: float = Field(default=0.0, ge=0.0, le=1.0)
    document_id: str = Field(..., alias="documentId")
    document_title: str = Field(default="", alias="documentTitle")
    total_scenes: int = Field(default=0, alias="totalScenes")
    status: str = "active"


class LessonListItem(Schema):
    id: str
    title: str
    subject: str = ""
    current_scene: int = Field(default=0, alias="currentScene")
    total_scenes: int = Field(default=0, alias="totalScenes")
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    document_id: str = Field(..., alias="documentId")


class Lesson(Schema):
    id: str
    title: str
    subject: str = ""
    document_id: str = Field(..., alias="documentId")
    scenes: list[Scene] = Field(default_factory=list)
    current_scene: int = Field(default=0, alias="currentScene")
    total_scenes: int = Field(default=0, alias="totalScenes")
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    status: str = "active"
    created_at: Optional[datetime] = None


class LessonGenerateRequest(Schema):
    """Request to generate a new lesson/topic (learning_session + scenes) from a document."""

    document_id: str = Field(..., alias="documentId")
    # Optional focus/prompt to steer scene generation (e.g. a sub-topic).
    focus: Optional[str] = Field(default=None, max_length=500)
    scene_count: Optional[int] = Field(default=None, alias="sceneCount", ge=1, le=20)


class LessonGenerateResponse(Schema):
    """Returned (HTTP 202) after enqueuing scene generation."""

    lesson_id: str = Field(..., alias="lessonId")
    job: JobRef
