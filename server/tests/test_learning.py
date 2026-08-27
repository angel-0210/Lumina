import pytest
from unittest.mock import patch
from app.repositories import document_repo
from sqlalchemy import text

@pytest.fixture
def mock_learning_jobs():
    with patch("app.jobs.manager.job_manager.submit") as mock_submit:
        mock_submit.return_value = "scene_job_99"
        yield mock_submit

def test_generate_lesson_ready_doc(client, auth_headers, db, mock_learning_jobs):
    # Pre-populate a completed document in DB so validation passes
    doc = document_repo.create(
        db,
        user_id="11111111-1111-1111-1111-111111111111",
        title="Physics Notes.pdf",
        file_key="https://cloudinary.com/test.pdf",
        file_type="application/pdf",
        file_size=200,
        status="completed"
    )
    # Set chunk_count > 0 so get_topic/lesson validation passes
    db.execute(
        text(f"UPDATE documents SET chunk_count = 5 WHERE id = '{doc['id']}'")
    )

    response = client.post(
        "/api/v1/lessons",
        headers=auth_headers,
        json={
            "documentId": str(doc["id"]),
            "sceneCount": 3,
            "focus": "Laws of motion"
        }
    )

    assert response.status_code == 202
    data = response.json()
    assert "data" in data
    assert "lessonId" in data["data"]
    assert data["data"]["job"]["job_id"] == "scene_job_99"
    
    lesson_id = data["data"]["lessonId"]

    # Verify we can list it as a topic
    response_topics = client.get("/api/v1/topics", headers=auth_headers)
    assert response_topics.status_code == 200
    data_topics = response_topics.json()
    assert len(data_topics["data"]) == 1
    assert data_topics["data"][0]["id"] == lesson_id

    # Verify we can fetch the lesson
    response_lesson = client.get(f"/api/v1/lessons/{lesson_id}", headers=auth_headers)
    assert response_lesson.status_code == 200
    data_lesson = response_lesson.json()
    assert data_lesson["data"]["id"] == lesson_id
