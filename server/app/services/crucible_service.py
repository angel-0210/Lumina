"""Concept Crucible service — Socratic assessment engine.

Flow (multi-turn, one HTTP request per turn):
    start   -> generate + store the first examiner question
    respond -> store the student's answer; either generate the next question or,
               once ``crucible_max_turns`` answers are in, grade the whole
               dialogue and persist concept scores.

Persistence:
    * The dialogue lives in ``session_messages`` on the topic's learning_session
      (examiner = role ``assistant`` / phase ``question``; student = role ``user``
      / phase ``answer``). A topic's learning_session only ever holds Crucible
      dialogue — Explore chats use their own sessions — so the two never mix.
    * ``assessment_sessions`` tracks status + chosen difficulty (level); grading
      writes ``concept_scores`` which the Mastery map aggregates.

Every question is grounded in the user's own document via real retrieval, and
retrieved text is confined to the untrusted-context delimiters in ``prompts``.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.engine import Connection

from app.ai import ai_service
from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.core.logging import get_logger
from app.core.security import AuthPrincipal
from app.repositories import assessment_repo, learning_repo, message_repo
from app.schemas.crucible import (
    ConceptScoreOut,
    CrucibleRespondRequest,
    CrucibleRespondResponse,
    CrucibleSessionDetail,
    CrucibleSessionListItem,
    CrucibleStartRequest,
    CrucibleStartResponse,
    DialogueTurn,
)
from .formatting import mastery_to_fraction, relative_date

logger = get_logger(__name__)

_DIALOGUE_PHASES = ["question", "answer"]
_MAX_DIALOGUE_MESSAGES = 200  # a Crucible has at most ~2*max_turns+1 messages


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _turn_role(message_role: Optional[str]) -> str:
    return "examiner" if message_role == "assistant" else "student"


def _to_turn(row: dict[str, Any]) -> DialogueTurn:
    return DialogueTurn(
        id=row["id"],
        role=_turn_role(row.get("role")),
        text=row.get("content") or "",
    )


def _dialogue_text(rows: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for r in rows:
        speaker = "Examiner" if r.get("role") == "assistant" else "Student"
        lines.append(f"{speaker}: {r.get('content') or ''}")
    return "\n".join(lines)


def _topic_name(row: dict[str, Any]) -> str:
    return row.get("title") or row.get("document_title") or "Study unit"


def _all_dialogue(conn: Connection, session_id: str, user_id: str) -> list[dict[str, Any]]:
    return message_repo.list_messages(
        conn,
        session_id,
        user_id,
        limit=_MAX_DIALOGUE_MESSAGES,
        offset=0,
        phases=_DIALOGUE_PHASES,
        ascending=True,
    )


# --------------------------------------------------------------------------- #
# start (fresh attempt)
# --------------------------------------------------------------------------- #
def start(
    conn: Connection, principal: AuthPrincipal, req: CrucibleStartRequest
) -> CrucibleStartResponse:
    # req.difficulty has been validated/normalised to a level (Curious/Student/Expert).
    topic = learning_repo.get_session_with_document(conn, req.topic_id, principal.id)
    if topic is None:
        raise NotFoundError("Topic not found.")
    document_id = topic["document_id"]

    assessment = assessment_repo.create_or_get(
        conn,
        learning_session_id=req.topic_id,
        user_id=principal.id,
        level=req.difficulty,
    )
    # Every "start" begins a clean attempt: clear prior dialogue + scores and
    # reopen the assessment at the requested difficulty.
    message_repo.delete_for_session(conn, req.topic_id)
    assessment_repo.clear_scores(conn, assessment["id"])
    assessment_repo.reopen(conn, assessment["id"], level=req.difficulty)

    question = ai_service.crucible_first_question(
        conn, user_id=principal.id, document_id=document_id, difficulty=req.difficulty
    )
    msg = message_repo.add_message(
        conn,
        learning_session_id=req.topic_id,
        role="assistant",
        phase="question",
        content=question.text,
        token_count=question.output_tokens or None,
    )

    logger.info("started crucible for topic %s (level %s)", req.topic_id, req.difficulty)
    return CrucibleStartResponse(
        sessionId=req.topic_id,
        topic=_topic_name(topic),
        difficulty=req.difficulty,
        question=DialogueTurn(id=msg["id"], role="examiner", text=question.text),
        turnsUsed=0,
        maxTurns=settings.crucible_max_turns,
    )


# --------------------------------------------------------------------------- #
# respond (answer -> next question or final grade)
# --------------------------------------------------------------------------- #
def respond(
    conn: Connection,
    principal: AuthPrincipal,
    session_id: str,
    req: CrucibleRespondRequest,
) -> CrucibleRespondResponse:
    topic = learning_repo.get_session_with_document(conn, session_id, principal.id)
    if topic is None:
        raise NotFoundError("Crucible session not found.")

    assessment = assessment_repo.get_by_learning_session(conn, session_id, principal.id)
    if assessment is None:
        raise BadRequestError("Start the crucible before responding.")
    if (assessment.get("status") or "") == "completed":
        raise BadRequestError("This crucible session is already complete. Start a new one.")

    document_id = topic["document_id"]
    level = assessment.get("level") or "Curious"
    max_turns = settings.crucible_max_turns

    # Record the student's answer.
    message_repo.add_message(
        conn,
        learning_session_id=session_id,
        role="user",
        phase="answer",
        content=req.answer,
    )
    turns_used = message_repo.count_messages(
        conn, session_id, principal.id, phases=["answer"]
    )

    dialogue_rows = _all_dialogue(conn, session_id, principal.id)
    dialogue = _dialogue_text(dialogue_rows)

    # Not done yet -> generate the next examiner question.
    if turns_used < max_turns:
        question = ai_service.crucible_followup_question(
            conn,
            user_id=principal.id,
            document_id=document_id,
            difficulty=level,
            dialogue=dialogue,
        )
        msg = message_repo.add_message(
            conn,
            learning_session_id=session_id,
            role="assistant",
            phase="question",
            content=question.text,
            token_count=question.output_tokens or None,
        )
        return CrucibleRespondResponse(
            sessionId=session_id,
            done=False,
            nextQuestion=DialogueTurn(id=msg["id"], role="examiner", text=question.text),
            turnsUsed=turns_used,
            maxTurns=max_turns,
        )

    # Final turn -> grade the full dialogue and persist scores.
    grading = ai_service.grade_crucible(
        conn, user_id=principal.id, document_id=document_id, dialogue=dialogue
    )
    assessment_repo.upsert_scores(
        conn,
        assessment["id"],
        [
            {
                "concept_name": c.concept_name,
                "score": c.score,
                "mastery": c.mastery,
                "evidence": c.evidence,
            }
            for c in grading.concepts
        ],
    )
    assessment_repo.complete(conn, assessment["id"])

    mastery = mastery_to_fraction(assessment_repo.average_mastery(conn, assessment["id"]))
    concepts = [
        ConceptScoreOut(
            name=c.concept_name,
            score=c.score,
            mastery=c.mastery,
            evidence=c.evidence,
        )
        for c in grading.concepts
    ]
    logger.info("completed crucible %s: score=%d", assessment["id"], grading.overall_score)
    return CrucibleRespondResponse(
        sessionId=session_id,
        done=True,
        nextQuestion=None,
        turnsUsed=turns_used,
        maxTurns=max_turns,
        score=grading.overall_score,
        mastery=mastery,
        concepts=concepts,
    )


# --------------------------------------------------------------------------- #
# history reads
# --------------------------------------------------------------------------- #
def list_sessions(
    conn: Connection, principal: AuthPrincipal, *, limit: int, offset: int
) -> tuple[list[CrucibleSessionListItem], int]:
    rows = assessment_repo.list_for_user(conn, principal.id, limit=limit, offset=offset)
    total = assessment_repo.count_for_user(conn, principal.id)

    items: list[CrucibleSessionListItem] = []
    for a in rows:
        ls_id = a["learning_session_id"]
        topic = learning_repo.get_session_with_document(conn, ls_id, principal.id)
        turns = message_repo.count_messages(conn, ls_id, principal.id, phases=["answer"])
        score = int(round(assessment_repo.average_score(conn, a["id"])))
        items.append(
            CrucibleSessionListItem(
                id=ls_id,
                topic=_topic_name(topic) if topic else "Assessment",
                score=score,
                turns=turns,
                date=relative_date(a.get("started_at")),
                status=a.get("status") or "started",
            )
        )
    return items, total


def get_session(
    conn: Connection, principal: AuthPrincipal, session_id: str
) -> CrucibleSessionDetail:
    topic = learning_repo.get_session_with_document(conn, session_id, principal.id)
    if topic is None:
        raise NotFoundError("Crucible session not found.")
    assessment = assessment_repo.get_by_learning_session(conn, session_id, principal.id)
    if assessment is None:
        raise NotFoundError("No crucible has been started for this topic.")

    dialogue_rows = _all_dialogue(conn, session_id, principal.id)
    turns = [_to_turn(r) for r in dialogue_rows]

    score_rows = assessment_repo.list_scores(conn, assessment["id"])
    concepts = [
        ConceptScoreOut(
            id=s.get("id"),
            name=s.get("concept_name") or "",
            score=int(s.get("score") or 0),
            mastery=int(s.get("mastery") or 0),
            evidence=s.get("evidence"),
        )
        for s in score_rows
    ]
    score = int(round(assessment_repo.average_score(conn, assessment["id"])))
    mastery = mastery_to_fraction(assessment_repo.average_mastery(conn, assessment["id"]))

    return CrucibleSessionDetail(
        id=session_id,
        topic=_topic_name(topic),
        difficulty=assessment.get("level") or "Curious",
        status=assessment.get("status") or "started",
        score=score,
        date=relative_date(assessment.get("started_at")),
        turns=turns,
        mastery=mastery,
        concepts=concepts,
    )
