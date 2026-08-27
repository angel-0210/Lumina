"""Concept Crucible (Socratic assessment) DTOs.

Mapping:
    Crucible session <-> assessment_session (+ session_messages for the dialogue)
    Turn             <-> a session_message rendered as { id, role, text }
    Scores/mastery   <-> concept_scores

Difficulty labels from the UI (Curious / Critical / Crucible) map to the DB
``level`` enum (Curious / Student / Expert).
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import Field, field_validator

from .common import Schema

DIFFICULTY_TO_LEVEL = {
    "curious": "Curious",
    "critical": "Student",
    "crucible": "Expert",
    # Accept the raw level names too.
    "student": "Student",
    "expert": "Expert",
}


class DialogueTurn(Schema):
    id: str
    role: Literal["examiner", "student"]
    text: str


class ConceptScoreOut(Schema):
    id: Optional[str] = None
    name: str = Field(..., description="Concept name")
    score: int = Field(..., ge=0, le=100)
    mastery: int = Field(..., ge=0, le=100)
    evidence: Optional[str] = None


class CrucibleStartRequest(Schema):
    # A topic/lesson == a learning_session.
    topic_id: str = Field(..., alias="topicId")
    difficulty: str = Field(default="Curious")

    @field_validator("difficulty")
    @classmethod
    def _map_difficulty(cls, v: str) -> str:
        key = (v or "").strip().lower()
        if key not in DIFFICULTY_TO_LEVEL:
            raise ValueError("Invalid difficulty. Expected Curious, Critical or Crucible.")
        return DIFFICULTY_TO_LEVEL[key]


class CrucibleStartResponse(Schema):
    session_id: str = Field(..., alias="sessionId")
    topic: str = ""
    difficulty: str = "Curious"
    question: DialogueTurn
    turns_used: int = Field(default=0, alias="turnsUsed")
    max_turns: int = Field(default=5, alias="maxTurns")


class CrucibleRespondRequest(Schema):
    answer: str = Field(..., min_length=1, max_length=4000)


class CrucibleRespondResponse(Schema):
    session_id: str = Field(..., alias="sessionId")
    done: bool = False
    next_question: Optional[DialogueTurn] = Field(default=None, alias="nextQuestion")
    turns_used: int = Field(default=0, alias="turnsUsed")
    max_turns: int = Field(default=5, alias="maxTurns")
    # Present when done.
    score: Optional[int] = Field(default=None, ge=0, le=100)
    mastery: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    concepts: Optional[list[ConceptScoreOut]] = None


class CrucibleSessionListItem(Schema):
    id: str
    topic: str = ""
    score: int = Field(default=0, ge=0, le=100)
    turns: int = 0
    date: str = ""
    status: str = "started"


class CrucibleSessionDetail(Schema):
    id: str
    topic: str = ""
    difficulty: str = "Curious"
    status: str = "started"
    score: int = Field(default=0, ge=0, le=100)
    date: str = ""
    turns: list[DialogueTurn] = Field(default_factory=list)
    mastery: float = Field(default=0.0, ge=0.0, le=1.0)
    concepts: list[ConceptScoreOut] = Field(default_factory=list)
