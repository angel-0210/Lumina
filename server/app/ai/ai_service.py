"""AI orchestration — the high-level operations the service layer calls.

This module is the *only* place that stitches together retrieval, context
assembly, prompt construction and generation. It returns plain dataclasses (not
DTOs) so the service layer stays in control of persistence and response shaping.

Every operation that answers from documents runs real retrieval first and passes
the caller's ``user_id`` down to the repositories, so grounding is always scoped
to the user's own documents. Retrieved text is inserted only inside the
untrusted-context delimiters defined in ``prompts`` (prompt-injection defense).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from sqlalchemy.engine import Connection

from app.ai import gemini_provider, prompts
from app.ai.rag import assemble_context, retrieve, source_labels
from app.core.config import settings
from app.core.logging import get_logger
from app.schemas.crucible import DIFFICULTY_TO_LEVEL

logger = get_logger(__name__)

_ALLOWED_VISUAL_TYPES = {"animation", "chart", "diagram", "code", "text"}
_NO_CONTEXT_ANSWER = (
    "I don't have enough information in your documents to answer that yet. "
    "Try uploading a relevant document or rephrasing your question."
)


# --------------------------------------------------------------------------- #
# Result types
# --------------------------------------------------------------------------- #
@dataclass
class AnswerResult:
    text: str
    citations: list[dict] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    used_chunk_ids: list[str] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    grounded: bool = True


@dataclass
class SceneOut:
    title: str
    narration: str
    visual_type: str
    visual_data: dict[str, Any]


@dataclass
class ScenesResult:
    title: str
    scenes: list[SceneOut]
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class QuestionResult:
    text: str
    citations: list[dict] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class ConceptScoreOut:
    concept_name: str
    score: int
    mastery: int
    evidence: Optional[str] = None


@dataclass
class GradingResult:
    overall_score: int
    concepts: list[ConceptScoreOut]
    input_tokens: int = 0
    output_tokens: int = 0


# --------------------------------------------------------------------------- #
# JSON parsing helpers (models sometimes wrap JSON in prose/fences)
# --------------------------------------------------------------------------- #
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def _parse_json_object(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    text = _FENCE.sub("", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fall back to the first balanced {...} span.
        start = text.find("{")
        end = text.rfind("}")
        if 0 <= start < end:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
    raise ValueError("Model did not return valid JSON.")


def _clamp_score(value: Any) -> int:
    try:
        return max(0, min(100, int(round(float(value)))))
    except (TypeError, ValueError):
        return 0


# --------------------------------------------------------------------------- #
# Explore: grounded RAG answering
# --------------------------------------------------------------------------- #
def answer_query(
    conn: Connection,
    *,
    user_id: str,
    query: str,
    document_id: Optional[str] = None,
    history: str = "",
) -> AnswerResult:
    """Retrieve grounding, then generate a cited answer. Real RAG, not passthrough."""
    chunks = retrieve(conn, user_id=user_id, query=query, document_id=document_id)
    assembled = assemble_context(chunks)

    if assembled.is_empty:
        return AnswerResult(text=_NO_CONTEXT_ANSWER, grounded=False)

    user_prompt = prompts.build_rag_user_prompt(query, assembled.numbered_sources, history)
    result = gemini_provider.generate_text(
        system_prompt=prompts.RAG_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.3,
    )
    return AnswerResult(
        text=result.text or _NO_CONTEXT_ANSWER,
        citations=assembled.citations,
        sources=source_labels(assembled.citations),
        used_chunk_ids=[c.chunk_id for c in assembled.used_chunks],
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        grounded=bool(result.text),
    )


# --------------------------------------------------------------------------- #
# Learn: tutorial scene generation
# --------------------------------------------------------------------------- #
def generate_scenes(
    conn: Connection,
    *,
    user_id: str,
    document_id: str,
    focus: str = "",
    scene_count: int = 5,
) -> ScenesResult:
    """Generate grounded tutorial scenes for a document."""
    scene_count = max(1, min(scene_count, 12))
    query = focus.strip() or "Key concepts and an overview to teach this material"
    top_k = min(max(scene_count * 2, settings.rag_top_k), 12)

    chunks = retrieve(
        conn,
        user_id=user_id,
        query=query,
        document_id=document_id,
        top_k=top_k,
    )
    assembled = assemble_context(chunks)
    if assembled.is_empty:
        raise ValueError("No document content is available to generate a lesson.")

    user_prompt = prompts.build_scene_generation_prompt(
        focus, assembled.numbered_sources, scene_count
    )
    result = gemini_provider.generate_text(
        system_prompt=prompts.SCENE_GENERATION_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.5,
        max_output_tokens=4096,
        json_mode=True,
    )

    payload = _parse_json_object(result.text)
    title = str(payload.get("title") or focus or "Lesson").strip()[:200]
    scenes: list[SceneOut] = []
    for raw in payload.get("scenes") or []:
        if not isinstance(raw, dict):
            continue
        visual_type = str(raw.get("visual_type") or "text").lower()
        if visual_type not in _ALLOWED_VISUAL_TYPES:
            visual_type = "text"
        visual_data = raw.get("visual_data")
        if not isinstance(visual_data, dict):
            visual_data = {}
        scenes.append(
            SceneOut(
                title=str(raw.get("title") or "Untitled").strip()[:200],
                narration=str(raw.get("narration") or "").strip(),
                visual_type=visual_type,
                visual_data=visual_data,
            )
        )
    if not scenes:
        raise ValueError("The lesson generator returned no scenes.")

    return ScenesResult(
        title=title,
        scenes=scenes,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )


# --------------------------------------------------------------------------- #
# Crucible: Socratic questioning + grading
# --------------------------------------------------------------------------- #
def _crucible_grounding(
    conn: Connection, *, user_id: str, document_id: Optional[str], seed: str
) -> Any:
    chunks = retrieve(
        conn,
        user_id=user_id,
        query=seed or "core concepts to assess understanding",
        document_id=document_id,
    )
    return assemble_context(chunks)


def crucible_first_question(
    conn: Connection,
    *,
    user_id: str,
    document_id: Optional[str],
    difficulty: str,
) -> QuestionResult:
    level = DIFFICULTY_TO_LEVEL.get((difficulty or "").lower(), difficulty or "Student")
    assembled = _crucible_grounding(
        conn, user_id=user_id, document_id=document_id, seed="key concepts overview"
    )
    system = prompts.CRUCIBLE_EXAMINER_SYSTEM_PROMPT.replace("{level}", level)
    user_prompt = prompts.build_crucible_first_prompt(level, assembled.numbered_sources)
    result = gemini_provider.generate_text(
        system_prompt=system, user_prompt=user_prompt, temperature=0.6, max_output_tokens=512
    )
    return QuestionResult(
        text=result.text or "Explain the core idea of this material in your own words.",
        citations=assembled.citations,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )


def crucible_followup_question(
    conn: Connection,
    *,
    user_id: str,
    document_id: Optional[str],
    difficulty: str,
    dialogue: str,
) -> QuestionResult:
    level = DIFFICULTY_TO_LEVEL.get((difficulty or "").lower(), difficulty or "Student")
    assembled = _crucible_grounding(
        conn, user_id=user_id, document_id=document_id, seed=dialogue[-500:]
    )
    system = prompts.CRUCIBLE_EXAMINER_SYSTEM_PROMPT.replace("{level}", level)
    user_prompt = prompts.build_crucible_followup_prompt(
        level, dialogue, assembled.numbered_sources
    )
    result = gemini_provider.generate_text(
        system_prompt=system, user_prompt=user_prompt, temperature=0.6, max_output_tokens=512
    )
    return QuestionResult(
        text=result.text or "Can you go deeper and justify your reasoning?",
        citations=assembled.citations,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )


def grade_crucible(
    conn: Connection,
    *,
    user_id: str,
    document_id: Optional[str],
    dialogue: str,
) -> GradingResult:
    assembled = _crucible_grounding(
        conn, user_id=user_id, document_id=document_id, seed=dialogue[:500]
    )
    user_prompt = prompts.build_grading_prompt(dialogue, assembled.numbered_sources)
    result = gemini_provider.generate_text(
        system_prompt=prompts.GRADING_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.2,
        max_output_tokens=1024,
        json_mode=True,
    )
    payload = _parse_json_object(result.text)
    concepts: list[ConceptScoreOut] = []
    for raw in payload.get("concepts") or []:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("concept_name") or "").strip()
        if not name:
            continue
        concepts.append(
            ConceptScoreOut(
                concept_name=name[:200],
                score=_clamp_score(raw.get("score")),
                mastery=_clamp_score(raw.get("mastery")),
                evidence=(str(raw.get("evidence")).strip()[:1000] if raw.get("evidence") else None),
            )
        )
    overall = _clamp_score(payload.get("overall_score"))
    if not concepts:
        concepts = [ConceptScoreOut(concept_name="Overall understanding", score=overall, mastery=overall)]
    return GradingResult(
        overall_score=overall,
        concepts=concepts,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )


# --------------------------------------------------------------------------- #
# Media prompt hardening (used by the VEO / image workers)
# --------------------------------------------------------------------------- #
def build_video_prompt(user_prompt: str, grounding: str = "") -> str:
    return prompts.build_video_prompt(user_prompt, grounding)


def build_image_prompt(user_prompt: str, grounding: str = "") -> str:
    return prompts.build_image_prompt(user_prompt, grounding)


def grounding_for_lesson(
    conn: Connection, *, user_id: str, document_id: Optional[str], seed: str
) -> str:
    """Return numbered-source text for a media prompt, scoped to the user's docs.

    Used by media workers to ground generated visuals in real document content
    while keeping that content inside the untrusted-context delimiters.
    """
    if not document_id:
        return ""
    assembled = _crucible_grounding(
        conn, user_id=user_id, document_id=document_id, seed=seed or "key visual concepts"
    )
    return assembled.numbered_sources
