import pytest
from unittest.mock import patch
from app.ai.base import EmbeddingResult
from app.ai.gemini_provider import GenerationResult
from app.repositories import document_repo, learning_repo

@pytest.fixture
def mock_crucible_ai():
    with patch("app.ai.rag.retrieve") as mock_retrieve, \
         patch("app.ai.gemini_provider.embed_query") as mock_embed, \
         patch("app.ai.gemini_provider.generate_text") as mock_generate:
        
        mock_retrieve.return_value = []
        
        mock_embed.return_value = [0.0] * 1536
        
        # Default mock examiner question
        mock_generate.return_value = GenerationResult(
            text="Explain the concept of Inertia in your own words.",
            input_tokens=15,
            output_tokens=10
        )
        
        yield {"retrieve": mock_retrieve, "generate": mock_generate, "embed": mock_embed}

def test_crucible_lifecycle(client, auth_headers, db, mock_crucible_ai):
    # Pre-populate a document owned by Evelyn (USER_ID_A)
    doc = document_repo.create(
        db,
        user_id="11111111-1111-1111-1111-111111111111",
        title="Physics Notes.pdf",
        file_key="https://cloudinary.com/test.pdf",
        file_type="application/pdf",
        file_size=200,
        status="completed"
    )
    
    # Pre-populate a learning session (topic) owned by Evelyn
    topic = learning_repo.create_session(
        db,
        user_id="11111111-1111-1111-1111-111111111111",
        document_id=doc["id"],
        title="Newton's Laws",
        status="active"
    )
    topic_id = str(topic["id"])

    # 1. Start session
    response = client.post(
        "/api/v1/crucible/start",
        headers=auth_headers,
        json={
            "topicId": topic_id,
            "difficulty": "Curious"
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    session_id = data["data"]["sessionId"]
    assert data["data"]["question"]["text"] == "Explain the concept of Inertia in your own words."

    # 2. Respond (middle turn)
    mock_crucible_ai["generate"].return_value = GenerationResult(
        text="How does that relate to mass?",
        input_tokens=20,
        output_tokens=12
    )
    response_resp = client.post(
        f"/api/v1/crucible/{session_id}/respond",
        headers=auth_headers,
        json={"answer": "Inertia is directly proportional to mass."}
    )
    assert response_resp.status_code == 200
    data_resp = response_resp.json()
    assert "data" in data_resp
    assert data_resp["data"]["done"] is False
    assert data_resp["data"]["nextQuestion"]["text"] == "How does that relate to mass?"

    # 3. Get active session detail
    response_get = client.get(
        f"/api/v1/crucible/sessions/{session_id}",
        headers=auth_headers
    )
    assert response_get.status_code == 200
    data_get = response_get.json()
    assert "data" in data_get
    assert len(data_get["data"]["turns"]) == 3  # Start question + response + follow up
