"""Analytics data transfer objects (DTOs)."""

from __future__ import annotations

from pydantic import Field

from .common import Schema


class DocumentStats(Schema):
    total: int
    completed: int
    processing: int
    failed: int
    pending: int
    total_bytes: int = Field(alias="totalBytes")


class ConceptStats(Schema):
    total: int
    mastered: int
    reviewing: int
    locked: int


class TopicStats(Schema):
    total: int
    average_mastery: float = Field(alias="averageMastery")


class UserActivity(Schema):
    crucible_sessions: int = Field(alias="crucibleSessions")
    total_turns: int = Field(alias="totalTurns")
    average_score: float = Field(alias="averageScore")


class AIUsage(Schema):
    total_jobs: int = Field(alias="totalJobs")
    scene_generation: int = Field(alias="sceneGeneration")
    question_generation: int = Field(alias="questionGeneration")
    grading: int = Field(alias="grading")
    input_tokens: int = Field(alias="inputTokens")
    output_tokens: int = Field(alias="outputTokens")


class ErrorsFailures(Schema):
    processing_errors: int = Field(alias="processingErrors")
    ai_errors: int = Field(alias="aiErrors")


class Analytics(Schema):
    document_stats: DocumentStats = Field(alias="documentStats")
    concept_stats: ConceptStats = Field(alias="conceptStats")
    topic_stats: TopicStats = Field(alias="topicStats")
    user_activity: UserActivity = Field(alias="userActivity")
    ai_usage: AIUsage = Field(alias="aiUsage")
    errors_failures: ErrorsFailures = Field(alias="errorsFailures")
