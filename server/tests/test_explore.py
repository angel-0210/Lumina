import pytest
from unittest.mock import patch, MagicMock
from app.ai.base import RetrievedChunk
from app.ai.gemini_provider import GenerationResult
from app.repositories import document_repo, chunk_repo

@pytest.fixture
def mock_rag_flow():
    with patch("app.ai.rag.retrieve") as mock_retrieve, \
         patch("app.ai.gemini_provider.embed_query") as mock_embed, \
         patch("app.ai.gemini_provider.generate_text") as mock_generate:
        
        # Mock retrieved chunks
        mock_retrieve.return_value = [
            RetrievedChunk(
                chunk_id="chunk_1",
                document_id="doc_1",
                document_title="Physics Notes.pdf",
                content="Newton's First Law: An object remains at rest unless acted upon.",
                chunk_index=0,
                score=0.9,
                method="vector"
            )
        ]
        
        # Mock embedding of query
        mock_embed.return_value = [0.0] * 1536
        
        # Mock Gemini response
        mock_generate.return_value = GenerationResult(
            text="According to the documents, Newton's First Law states that objects remain at rest unless a force acts on them.",
            input_tokens=10,
            output_tokens=20
        )
        
        yield {"retrieve": mock_retrieve, "generate": mock_generate, "embed": mock_embed}

def test_explore_query_rag(client, auth_headers, db, mock_rag_flow):
    # Pre-populate a completed document owned by Evelyn (USER_ID_A)
    doc = document_repo.create(
        db,
        user_id="11111111-1111-1111-1111-111111111111",
        title="Physics Notes.pdf",
        file_key="https://cloudinary.com/test.pdf",
        file_type="application/pdf",
        file_size=200,
        status="completed"
    )
    doc_id = str(doc["id"])

    # Pre-populate document chunks
    chunk_repo.bulk_insert(
        db,
        document_id=doc_id,
        chunks=[
            {
                "content": "Newton's First Law: An object remains at rest unless acted upon.",
                "chunk_index": 0,
                "chunk_hash": "mock_hash_123",
                "token_count": 10,
                "embedding": [0.0] * 1536
            }
        ]
    )

    response = client.post(
        "/api/v1/explore/query",
        headers=auth_headers,
        json={
            "query": "What is Newton's First Law?",
            "documentId": doc_id
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "sessionId" in data["data"]
    assert "Newton's First Law" in data["data"]["message"]["text"]
    assert len(data["data"]["message"]["sources"]) == 1
    assert data["data"]["message"]["sources"][0] == "Physics Notes.pdf · section 1"
