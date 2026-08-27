import pytest
from unittest.mock import patch, MagicMock
from io import BytesIO
from app.integrations.cloudinary_client import UploadedAsset
from app.ai.ai_service import TopicExtractionResult, ExtractedTopic, ExtractedConcept, AnswerResult, QuestionResult, GradingResult, ConceptScoreOut

USER_ID_A = "11111111-1111-1111-1111-111111111111"

@pytest.fixture
def mock_cloudinary_doc():
    with patch("app.integrations.cloudinary_client.upload_document") as mock_upload, \
         patch("app.integrations.cloudinary_client.download_bytes") as mock_download, \
         patch("app.ai.rag.ingestion.cloudinary_client.download_bytes") as mock_rag_download, \
         patch("app.integrations.cloudinary_client.delete_document") as mock_delete:
        
        asset = UploadedAsset(
            url="https://res.cloudinary.com/mock/documents/lumina_test.txt",
            public_id="mock_public_id_e2e",
            resource_type="raw",
            bytes=500
        )
        mock_upload.return_value = asset
        mock_bytes = b"Artificial Intelligence and Machine Learning Notes.\nSupervised Learning: Labeled data.\nUnsupervised Learning: Unlabeled data."
        mock_download.return_value = mock_bytes
        mock_rag_download.return_value = mock_bytes
        yield {"upload": mock_upload, "download": mock_download, "delete": mock_delete}


@pytest.fixture
def mock_ai_pipeline():
    mock_vec = [0.1] * 1536
    mock_embed = lambda texts, **kw: [mock_vec for _ in texts]

    with patch("app.ai.embedding_service.embed_documents", side_effect=mock_embed), \
         patch("app.ai.embedding_service.embed_query", return_value=mock_vec), \
         patch("app.ai.rag.ingestion.embedding_service.embed_documents", side_effect=mock_embed), \
         patch("app.ai.rag.ingestion.embedding_service.embed_query", return_value=mock_vec), \
         patch("app.ai.ai_service.extract_topics_and_concepts") as mock_topics, \
         patch("app.ai.ai_service.answer_query") as mock_rag, \
         patch("app.ai.ai_service.crucible_first_question") as mock_c1, \
         patch("app.ai.ai_service.crucible_followup_question") as mock_c2, \
         patch("app.ai.ai_service.grade_crucible") as mock_grade, \
         patch("app.jobs.manager.job_manager.submit", return_value="job_e2e_123"):

        mock_topics.return_value = TopicExtractionResult(
            topics=[
                ExtractedTopic(
                    title="Supervised Learning",
                    description="Classification and Regression algorithms",
                    concepts=[
                        ExtractedConcept(name="Classification", description="Categorical prediction"),
                        ExtractedConcept(name="Regression", description="Continuous value estimation"),
                    ]
                ),
                ExtractedTopic(
                    title="Neural Networks",
                    description="Deep learning architectures",
                    concepts=[
                        ExtractedConcept(name="Backpropagation", description="Gradient update rule"),
                    ]
                )
            ]
        )

        mock_rag.return_value = AnswerResult(
            text="Supervised learning uses labeled datasets to train predictive models.",
            sources=["lumina_test.txt · section 1"],
            citations=[{"id": "chunk_123", "chunk_id": "chunk_123", "rank": 1, "score": 0.95}],
            grounded=True
        )

        mock_c1.return_value = QuestionResult(
            text="How does classification differ from regression in supervised learning?",
            citations=[]
        )

        mock_c2.return_value = QuestionResult(
            text="What loss function would you use for continuous output prediction?",
            citations=[]
        )

        mock_grade.return_value = GradingResult(
            overall_score=85,
            concepts=[
                ConceptScoreOut(concept_name="Classification", score=90, mastery=85, evidence="Clear explanation"),
                ConceptScoreOut(concept_name="Regression", score=80, mastery=80, evidence="Good understanding"),
            ]
        )

        yield {
            "topics": mock_topics,
            "rag": mock_rag,
            "c1": mock_c1,
            "c2": mock_c2,
            "grade": mock_grade,
        }


def test_full_learning_pipeline_e2e(client, auth_headers, mock_cloudinary_doc, mock_ai_pipeline):
    # Step 1: Upload study document
    file_content = b"Artificial Intelligence and Machine Learning Notes..."
    file_io = BytesIO(file_content)

    res = client.post(
        "/api/v1/documents",
        headers=auth_headers,
        files={"file": ("lumina_test.txt", file_io, "text/plain")}
    )
    assert res.status_code == 202
    doc_id = res.json()["data"]["document"]["id"]

    # Step 2: Ingest document and extract topics synchronously
    from app.core.database import connection_scope
    from app.ai.rag.ingestion import ingest_document
    from app.repositories import topic_repo, learning_repo, document_repo

    with connection_scope() as conn:
        result = ingest_document(
            conn,
            document_id=doc_id,
            file_key="https://res.cloudinary.com/mock/documents/lumina_test.txt",
            file_type="text/plain"
        )
        assert result.chunk_count > 0
        document_repo.update_status(conn, doc_id, status="completed", chunk_count=result.chunk_count)

        # Step 3: Trigger topic & concept extraction and persist
        user_id = USER_ID_A
        extracted = mock_ai_pipeline["topics"].return_value
        for t_idx, topic_data in enumerate(extracted.topics):
            t_row = topic_repo.create_topic(
                conn, document_id=doc_id, user_id=user_id, title=topic_data.title, description=topic_data.description, order_index=t_idx
            )
            for c_idx, c_data in enumerate(topic_data.concepts):
                topic_repo.create_concept(
                    conn, topic_id=t_row["id"], document_id=doc_id, user_id=user_id, name=c_data.name, description=c_data.description, order_index=c_idx
                )
            learning_repo.create_session(
                conn, user_id=user_id, document_id=doc_id, title=topic_data.title, status="active"
            )

    # Step 4: Verify Learn tab topics listing
    topics_res = client.get("/api/v1/topics", headers=auth_headers)
    assert topics_res.status_code == 200
    topics_data = topics_res.json()["data"]
    assert len(topics_data) >= 2
    topic_id = topics_data[0]["id"]

    # Step 5: Verify Mastery Map (Conceptual nodes before Crucible)
    map_res = client.get(f"/api/v1/mastery/{topic_id}", headers=auth_headers)
    assert map_res.status_code == 200
    map_data = map_res.json()["data"]
    assert len(map_data["concepts"]) >= 2

    # Step 6: Verify Explore RAG query
    rag_res = client.post(
        "/api/v1/explore/query",
        headers=auth_headers,
        json={"query": "What is supervised learning?", "documentId": doc_id}
    )
    assert rag_res.status_code == 200
    assert "Supervised learning" in rag_res.json()["data"]["message"]["text"]

    # Step 7: Verify Concept Crucible flow
    c_start_res = client.post(
        "/api/v1/crucible/start",
        headers=auth_headers,
        json={"topicId": topic_id, "difficulty": "Curious"}
    )
    assert c_start_res.status_code == 200
    c_start_data = c_start_res.json()["data"]
    assert "examiner" in c_start_data["question"]["role"]

    session_id = c_start_data["sessionId"]
    c_resp = client.post(
        f"/api/v1/crucible/{session_id}/respond",
        headers=auth_headers,
        json={"answer": "Classification predicts discrete labels while regression predicts continuous numerical outputs."}
    )
    assert c_resp.status_code == 200
