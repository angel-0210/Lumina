"""Topics & concepts repository for structured document learning models."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func, insert, select
from sqlalchemy.engine import Connection

from app.models.tables import concepts, topics
from .base import first_dict, row_to_dict, rows_to_dicts


def create_topic(
    conn: Connection,
    *,
    document_id: str,
    user_id: str,
    title: str,
    description: Optional[str] = None,
    order_index: int = 0,
) -> dict[str, Any]:
    stmt = (
        insert(topics)
        .values(
            document_id=document_id,
            user_id=user_id,
            title=title,
            description=description,
            order_index=order_index,
        )
        .returning(topics)
    )
    return first_dict(conn.execute(stmt))  # type: ignore[return-value]


def create_concept(
    conn: Connection,
    *,
    topic_id: str,
    document_id: str,
    user_id: str,
    name: str,
    description: Optional[str] = None,
    order_index: int = 0,
) -> dict[str, Any]:
    stmt = (
        insert(concepts)
        .values(
            topic_id=topic_id,
            document_id=document_id,
            user_id=user_id,
            name=name,
            description=description,
            order_index=order_index,
        )
        .returning(concepts)
    )
    return first_dict(conn.execute(stmt))  # type: ignore[return-value]


def list_topics_for_document(
    conn: Connection, document_id: str, user_id: str
) -> list[dict[str, Any]]:
    stmt = (
        select(topics)
        .where(
            topics.c.document_id == document_id,
            topics.c.user_id == user_id,
            topics.c.deleted_at.is_(None),
        )
        .order_by(topics.c.order_index.asc(), topics.c.created_at.asc())
    )
    return rows_to_dicts(conn.execute(stmt))


def list_topics_for_user(
    conn: Connection,
    user_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
    document_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    conditions = [topics.c.user_id == user_id, topics.c.deleted_at.is_(None)]
    if document_id:
        conditions.append(topics.c.document_id == document_id)
    stmt = (
        select(topics)
        .where(*conditions)
        .order_by(topics.c.created_at.desc(), topics.c.order_index.asc())
        .limit(limit)
        .offset(offset)
    )
    return rows_to_dicts(conn.execute(stmt))


def count_topics_for_user(
    conn: Connection, user_id: str, *, document_id: Optional[str] = None
) -> int:
    conditions = [topics.c.user_id == user_id, topics.c.deleted_at.is_(None)]
    if document_id:
        conditions.append(topics.c.document_id == document_id)
    stmt = select(func.count()).select_from(topics).where(*conditions)
    return int(conn.execute(stmt).scalar_one())


def list_concepts_for_topic(
    conn: Connection, topic_id: str, user_id: str
) -> list[dict[str, Any]]:
    stmt = (
        select(concepts)
        .where(
            concepts.c.topic_id == topic_id,
            concepts.c.user_id == user_id,
            concepts.c.deleted_at.is_(None),
        )
        .order_by(concepts.c.order_index.asc(), concepts.c.created_at.asc())
    )
    return rows_to_dicts(conn.execute(stmt))


def list_concepts_for_document(
    conn: Connection, document_id: str, user_id: str
) -> list[dict[str, Any]]:
    stmt = (
        select(concepts)
        .where(
            concepts.c.document_id == document_id,
            concepts.c.user_id == user_id,
            concepts.c.deleted_at.is_(None),
        )
        .order_by(concepts.c.order_index.asc())
    )
    return rows_to_dicts(conn.execute(stmt))
