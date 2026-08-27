"""Pydantic DTOs (the public API contract).

Response envelopes ``{data, meta}`` / ``{error}`` are built in
``app.core.responses``; the models here describe the ``data`` payloads.
"""

from .common import MessageResponse, PageMeta, Schema
from .job import JobRef, JobStatus
from .auth import (
    AuthResponse,
    AuthUser,
    LoginRequest,
    RefreshRequest,
    SignupRequest,
)
from .profile import Profile, ProfileUpdate
from .document import (
    DocumentDetail,
    DocumentListItem,
    DocumentTopicRef,
    ProcessingStatus,
    UploadResponse,
)
from .learning import (
    Lesson,
    LessonGenerateRequest,
    LessonGenerateResponse,
    LessonListItem,
    Scene,
    Topic,
)
from .explore import (
    ChatMessage,
    Citation,
    ExploreQueryRequest,
    ExploreQueryResponse,
)
from .crucible import (
    ConceptScoreOut,
    CrucibleRespondRequest,
    CrucibleRespondResponse,
    CrucibleSessionDetail,
    CrucibleSessionListItem,
    CrucibleStartRequest,
    CrucibleStartResponse,
    DialogueTurn,
    DIFFICULTY_TO_LEVEL,
)
from .mastery import ConceptNode, MasteryMap, MasterySummaryItem
from .dashboard import ContinueLearning, Dashboard
from .media import (
    ImageGenerateRequest,
    MediaAsset,
    VideoGenerateRequest,
    VideoGenerateResponse,
)

__all__ = [
    "Schema",
    "PageMeta",
    "MessageResponse",
    "JobRef",
    "JobStatus",
    "SignupRequest",
    "LoginRequest",
    "RefreshRequest",
    "AuthResponse",
    "AuthUser",
    "Profile",
    "ProfileUpdate",
    "DocumentListItem",
    "DocumentDetail",
    "DocumentTopicRef",
    "UploadResponse",
    "ProcessingStatus",
    "Topic",
    "Lesson",
    "LessonListItem",
    "Scene",
    "LessonGenerateRequest",
    "LessonGenerateResponse",
    "ChatMessage",
    "Citation",
    "ExploreQueryRequest",
    "ExploreQueryResponse",
    "DialogueTurn",
    "ConceptScoreOut",
    "CrucibleStartRequest",
    "CrucibleStartResponse",
    "CrucibleRespondRequest",
    "CrucibleRespondResponse",
    "CrucibleSessionListItem",
    "CrucibleSessionDetail",
    "DIFFICULTY_TO_LEVEL",
    "MasterySummaryItem",
    "ConceptNode",
    "MasteryMap",
    "Dashboard",
    "ContinueLearning",
    "MediaAsset",
    "VideoGenerateRequest",
    "VideoGenerateResponse",
    "ImageGenerateRequest",
]
