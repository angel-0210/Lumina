import pytest
from unittest.mock import patch, MagicMock
from io import BytesIO
from app.integrations.cloudinary_client import UploadedAsset

@pytest.fixture
def mock_cloudinary_doc():
    with patch("app.integrations.cloudinary_client.upload_document") as mock_upload, \
         patch("app.integrations.cloudinary_client.delete_document") as mock_delete:
        
        mock_upload.return_value = UploadedAsset(
            url="https://res.cloudinary.com/mock/documents/test.pdf",
            public_id="mock_public_id_123",
            resource_type="raw",
            bytes=100
        )
        yield {"upload": mock_upload, "delete": mock_delete}

@pytest.fixture
def mock_job_manager():
    with patch("app.jobs.manager.job_manager.submit") as mock_submit:
        mock_submit.return_value = "job_12345"
        yield mock_submit

def test_upload_document_flow(client, auth_headers, mock_cloudinary_doc, mock_job_manager):
    file_content = b"Mock document content for text extraction."
    file_io = BytesIO(file_content)

    response = client.post(
        "/api/v1/documents",
        headers=auth_headers,
        files={"file": ("test.txt", file_io, "text/plain")}
    )

    assert response.status_code == 202
    data = response.json()
    assert "data" in data
    assert data["data"]["document"]["title"] == "test"
    assert data["data"]["job"]["job_id"] == "job_12345"
    
    doc_id = data["data"]["document"]["id"]
    
    # Verify we can list it
    response_list = client.get("/api/v1/documents", headers=auth_headers)
    assert response_list.status_code == 200
    data_list = response_list.json()
    assert len(data_list["data"]) == 1
    assert data_list["data"][0]["id"] == doc_id

    # Verify status
    response_status = client.get(f"/api/v1/documents/{doc_id}/status", headers=auth_headers)
    assert response_status.status_code == 200
    data_status = response_status.json()
    assert data_status["data"]["status"] == "pending"

    # Verify delete
    response_delete = client.delete(f"/api/v1/documents/{doc_id}", headers=auth_headers)
    assert response_delete.status_code == 200
    assert "data" in response_delete.json()
    
    mock_cloudinary_doc["delete"].assert_called_once_with("mock_public_id_123")
