"""Analytics service.

Aggregates statistics across documents, concepts, AI jobs, and crucible attempts.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.core.security import AuthPrincipal
from app.schemas.analytics import (
    AIUsage,
    Analytics,
    ConceptStats,
    DocumentStats,
    ErrorsFailures,
    TopicStats,
    UserActivity,
)


def get_analytics(conn: Connection, principal: AuthPrincipal) -> Analytics:
    user_id = principal.id

    # 1. Document Stats
    doc_sql = text(
        """
        SELECT
            COUNT(id) AS total,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
            COALESCE(SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END), 0) AS processing,
            COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
            COALESCE(SUM(file_size), 0) AS total_bytes
        FROM documents
        WHERE user_id = :user_id AND deleted_at IS NULL
        """
    )
    doc_res = conn.execute(doc_sql, {"user_id": user_id}).mappings().first() or {
        "total": 0,
        "completed": 0,
        "processing": 0,
        "failed": 0,
        "pending": 0,
        "total_bytes": 0,
    }

    # 2. Topic Stats
    topic_sql = text(
        """
        SELECT
            COUNT(id) AS total
        FROM topics
        WHERE user_id = :user_id AND deleted_at IS NULL
        """
    )
    topic_res = conn.execute(topic_sql, {"user_id": user_id}).mappings().first() or {"total": 0}
    total_topics = topic_res["total"]

    # Average mastery across topics (from assessment sessions / concept scores)
    mastery_sql = text(
        """
        SELECT
            AVG(cs.mastery) AS avg_mastery
        FROM concept_scores cs
        JOIN assessment_sessions a ON a.id = cs.assessment_session_id
        WHERE a.user_id = :user_id
        """
    )
    mastery_res = conn.execute(mastery_sql, {"user_id": user_id}).mappings().first() or {"avg_mastery": 0.0}
    avg_mastery = float(mastery_res["avg_mastery"] or 0.0)

    # 3. Concept Stats
    concepts_sql = text(
        """
        SELECT
            COUNT(c.id) AS total,
            COALESCE(SUM(CASE WHEN cs.mastery >= 70 THEN 1 ELSE 0 END), 0) AS mastered,
            COALESCE(SUM(CASE WHEN cs.mastery < 70 AND cs.mastery > 0 THEN 1 ELSE 0 END), 0) AS reviewing,
            COALESCE(SUM(CASE WHEN cs.mastery IS NULL OR cs.mastery = 0 THEN 1 ELSE 0 END), 0) AS locked
        FROM concepts c
        LEFT JOIN topics t ON t.id = c.topic_id AND t.deleted_at IS NULL
        LEFT JOIN learning_sessions ls ON ls.document_id = t.document_id AND ls.user_id = :user_id AND ls.deleted_at IS NULL
        LEFT JOIN assessment_sessions a ON a.learning_session_id = ls.id
        LEFT JOIN concept_scores cs ON cs.assessment_session_id = a.id AND cs.concept_name = c.name
        WHERE c.user_id = :user_id AND c.deleted_at IS NULL
        """
    )
    concepts_res = conn.execute(concepts_sql, {"user_id": user_id}).mappings().first() or {
        "total": 0,
        "mastered": 0,
        "reviewing": 0,
        "locked": 0,
    }

    # If they have no concepts yet in the table, count from concept_scores directly as fallback
    if concepts_res["total"] == 0:
        fallback_sql = text(
            """
            SELECT
                COUNT(cs.id) AS total,
                COALESCE(SUM(CASE WHEN cs.mastery >= 70 THEN 1 ELSE 0 END), 0) AS mastered,
                COALESCE(SUM(CASE WHEN cs.mastery < 70 AND cs.mastery > 0 THEN 1 ELSE 0 END), 0) AS reviewing,
                COALESCE(SUM(CASE WHEN cs.mastery = 0 THEN 1 ELSE 0 END), 0) AS locked
            FROM concept_scores cs
            JOIN assessment_sessions a ON a.id = cs.assessment_session_id
            WHERE a.user_id = :user_id
            """
        )
        concepts_res = conn.execute(fallback_sql, {"user_id": user_id}).mappings().first() or {
            "total": 0,
            "mastered": 0,
            "reviewing": 0,
            "locked": 0,
        }

    # 4. User Activity
    activity_sql = text(
        """
        SELECT
            COUNT(DISTINCT a.id) AS crucible_sessions,
            COALESCE(SUM(cs.score), 0) AS total_score,
            COUNT(cs.id) AS total_turns
        FROM assessment_sessions a
        LEFT JOIN concept_scores cs ON cs.assessment_session_id = a.id
        WHERE a.user_id = :user_id
        """
    )
    activity_res = conn.execute(activity_sql, {"user_id": user_id}).mappings().first() or {
        "crucible_sessions": 0,
        "total_score": 0,
        "total_turns": 0,
    }
    sessions = activity_res["crucible_sessions"]
    turns = activity_res["total_turns"]
    avg_score = float(activity_res["total_score"] / sessions) if sessions > 0 else 0.0

    # 5. AI Usage
    ai_sql = text(
        """
        SELECT
            COUNT(ag.id) AS total_jobs,
            COALESCE(SUM(CASE WHEN ag.job_type = 'scene_generation' THEN 1 ELSE 0 END), 0) AS scene_gen,
            COALESCE(SUM(CASE WHEN ag.job_type = 'question_generation' THEN 1 ELSE 0 END), 0) AS question_gen,
            COALESCE(SUM(CASE WHEN ag.job_type = 'grading' THEN 1 ELSE 0 END), 0) AS grading,
            COALESCE(SUM(ag.input_token_count), 0) AS input_tokens,
            COALESCE(SUM(ag.output_token_count), 0) AS output_tokens
        FROM ai_generation_jobs ag
        JOIN learning_sessions ls ON ls.id = ag.learning_session_id
        WHERE ls.user_id = :user_id
        """
    )
    ai_res = conn.execute(ai_sql, {"user_id": user_id}).mappings().first() or {
        "total_jobs": 0,
        "scene_gen": 0,
        "question_gen": 0,
        "grading": 0,
        "input_tokens": 0,
        "output_tokens": 0,
    }

    # 6. Errors & Failures
    err_sql = text(
        """
        SELECT
            COUNT(dp.id) AS failed_docs
        FROM document_processing_jobs dp
        JOIN documents d ON d.id = dp.document_id
        WHERE d.user_id = :user_id AND dp.status = 'failed'
        """
    )
    failed_docs = conn.execute(err_sql, {"user_id": user_id}).scalar() or 0

    failed_ai_sql = text(
        """
        SELECT
            COUNT(ag.id) AS failed_ai
        FROM ai_generation_jobs ag
        JOIN learning_sessions ls ON ls.id = ag.learning_session_id
        WHERE ls.user_id = :user_id AND ag.status = 'failed'
        """
    )
    failed_ai = conn.execute(failed_ai_sql, {"user_id": user_id}).scalar() or 0

    return Analytics(
        documentStats=DocumentStats(
            total=doc_res["total"],
            completed=doc_res["completed"],
            processing=doc_res["processing"],
            failed=doc_res["failed"],
            pending=doc_res["pending"],
            totalBytes=doc_res["total_bytes"],
        ),
        conceptStats=ConceptStats(
            total=concepts_res["total"],
            mastered=concepts_res["mastered"],
            reviewing=concepts_res["reviewing"],
            locked=concepts_res["locked"],
        ),
        topicStats=TopicStats(
            total=total_topics,
            averageMastery=avg_mastery,
        ),
        userActivity=UserActivity(
            crucibleSessions=sessions,
            totalTurns=turns,
            averageScore=avg_score,
        ),
        aiUsage=AIUsage(
            totalJobs=ai_res["total_jobs"],
            sceneGeneration=ai_res["scene_gen"],
            questionGeneration=ai_res["question_gen"],
            grading=ai_res["grading"],
            inputTokens=ai_res["input_tokens"],
            outputTokens=ai_res["output_tokens"],
        ),
        errorsFailures=ErrorsFailures(
            processingErrors=failed_docs,
            aiErrors=failed_ai,
        ),
    )
