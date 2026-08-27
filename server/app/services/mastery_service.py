"""Mastery service — the Understanding Map.

Aggregates ``concept_scores`` (written by the Concept Crucible) into:
    * a per-document summary (subject + 0-1 progress) for the dashboard, and
    * a per-topic concept map with a simple linear prerequisite chain.

All reads are scoped to the caller via the repository layer's ownership filters.
Mastery is stored 0-100 and surfaced to the UI as a 0-1 fraction.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.engine import Connection

from app.core.exceptions import NotFoundError
from app.core.security import AuthPrincipal
from app.repositories import learning_repo, mastery_repo
from app.schemas.mastery import ConceptNode, MasteryMap, MasterySummaryItem
from .formatting import clamp01, mastery_to_fraction

# Deterministic palette so a subject keeps the same colour across reloads.
_PALETTE = [
    "#6366f1", "#22c55e", "#f59e0b", "#ef4444",
    "#06b6d4", "#a855f7", "#ec4899", "#14b8a6",
]

_MASTERED_AT = 70  # mastery >= this (0-100) counts as "Mastered"


def _color_for(index: int) -> str:
    return _PALETTE[index % len(_PALETTE)]


def get_summary(conn: Connection, principal: AuthPrincipal) -> list[MasterySummaryItem]:
    rows = mastery_repo.summary_by_document(conn, principal.id)
    return [
        MasterySummaryItem(
            subject=r.get("subject") or "Untitled",
            progress=mastery_to_fraction(r.get("mastery")),
            color=_color_for(i),
            topicId=None,  # per-document aggregate; the concept map is per topic
        )
        for i, r in enumerate(rows)
    ]


def _node_status(mastery_0_100: float) -> str:
    if mastery_0_100 >= _MASTERED_AT:
        return "Mastered"
    if mastery_0_100 > 0:
        return "Reviewing"
    return "Locked"


def get_map(conn: Connection, principal: AuthPrincipal, topic_id: str) -> MasteryMap:
    topic = learning_repo.get_session_with_document(conn, topic_id, principal.id)
    if topic is None:
        raise NotFoundError("Topic not found.")

    rows = mastery_repo.concepts_for_topic(conn, topic_id, principal.id)

    concepts: list[ConceptNode] = []
    prev_id: str | None = None
    total = 0.0
    for r in rows:
        mastery_val = float(r.get("mastery") or 0)
        total += mastery_val
        concepts.append(
            ConceptNode(
                id=str(r["id"]),
                name=r.get("concept_name") or "",
                status=_node_status(mastery_val),
                progress=mastery_to_fraction(mastery_val),
                prerequisite=prev_id,
            )
        )
        prev_id = str(r["id"])

    overall = clamp01((total / len(concepts) / 100.0)) if concepts else 0.0
    return MasteryMap(
        topicName=topic.get("title") or topic.get("document_title") or "Study unit",
        topicId=topic_id,
        overallMastery=overall,
        concepts=concepts,
    )
