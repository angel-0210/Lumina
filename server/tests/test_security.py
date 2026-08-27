import pytest
from app.repositories import document_repo, learning_repo

def test_document_cross_user_isolation(client, db, auth_headers, auth_headers_other):
    # 1. Create a document owned by User B (Other User)
    doc_b = document_repo.create(
        db,
        user_id="22222222-2222-2222-2222-222222222222", # USER_ID_B
        title="Secret Notes.pdf",
        file_key="https://cloudinary.com/secret.pdf",
        file_type="application/pdf",
        file_size=500,
        status="completed"
    )
    doc_b_id = str(doc_b["id"])

    # 2. Try to fetch doc B using User A's headers (Dr. Evelyn Vance) -> should return 404
    response_get = client.get(f"/api/v1/documents/{doc_b_id}", headers=auth_headers)
    assert response_get.status_code == 404

    # 3. Try to delete doc B using User A's headers -> should return 404
    response_delete = client.delete(f"/api/v1/documents/{doc_b_id}", headers=auth_headers)
    assert response_delete.status_code == 404

    # 4. Fetching using User B's headers -> should succeed (200)
    response_ok = client.get(f"/api/v1/documents/{doc_b_id}", headers=auth_headers_other)
    assert response_ok.status_code == 200

def test_learning_session_cross_user_isolation(client, db, auth_headers, auth_headers_other):
    # 1. Create a document owned by User B
    doc_b = document_repo.create(
        db,
        user_id="22222222-2222-2222-2222-222222222222",
        title="User B Doc.pdf",
        file_key="https://cloudinary.com/userb.pdf",
        file_type="application/pdf",
        file_size=300,
        status="completed"
    )
    
    # 2. Create a study session (topic) for User B
    session_b = learning_repo.create_session(
        db,
        user_id="22222222-2222-2222-2222-222222222222",
        document_id=doc_b["id"],
        title="Concept Alpha",
        status="active"
    )
    session_b_id = str(session_b["id"])

    # 3. Try to load this session's topic details as User A -> should return 404
    response_topic = client.get(f"/api/v1/topics/{session_b_id}", headers=auth_headers)
    assert response_topic.status_code == 404

    # 4. Try to load this session's lesson details as User A -> should return 404
    response_lesson = client.get(f"/api/v1/lessons/{session_b_id}", headers=auth_headers)
    assert response_lesson.status_code == 404
