"""Mastery / Understanding Map DTOs.

Mapping:
    Mastery summary : aggregated per document/topic from concept_scores
    Mastery map     : concept_scores for a topic, arranged as an ordered graph
                      with a simple prerequisite chain

Shapes match the frontend:
    summary item : { subject, progress(0-1), color }
    map          : { topicName, overallMastery(0-1), concepts: [ConceptNode] }
    concept node : { id, name, status, progress(0-1), prerequisite: id|null }
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import Field

from .common import Schema

ConceptStatus = Literal["Mastered", "Reviewing", "Locked"]


class MasterySummaryItem(Schema):
    subject: str
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    color: str = "#6366f1"
    topic_id: Optional[str] = Field(default=None, alias="topicId")


class ConceptNode(Schema):
    id: str
    name: str
    status: ConceptStatus = "Locked"
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    prerequisite: Optional[str] = None


class MasteryMap(Schema):
    topic_name: str = Field(..., alias="topicName")
    topic_id: Optional[str] = Field(default=None, alias="topicId")
    overall_mastery: float = Field(default=0.0, ge=0.0, le=1.0, alias="overallMastery")
    concepts: list[ConceptNode] = Field(default_factory=list)
