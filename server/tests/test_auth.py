import pytest
from unittest.mock import patch
from app.integrations.supabase_auth import AuthSession

@pytest.fixture
def mock_supabase_auth():
    with patch("app.integrations.supabase_auth.sign_in") as mock_in, \
         patch("app.integrations.supabase_auth.sign_up") as mock_up, \
         patch("app.integrations.supabase_auth.refresh") as mock_ref, \
         patch("app.integrations.supabase_auth.sign_out") as mock_out:
        
        yield {
            "sign_in": mock_in,
            "sign_up": mock_up,
            "refresh": mock_ref,
            "sign_out": mock_out,
        }

def test_login_flow(client, mock_supabase_auth):
    mock_user = {
        "id": "11111111-1111-1111-1111-111111111111",
        "email": "evelyn@lumina.ai",
        "user_metadata": {"name": "Dr. Evelyn Vance"}
    }
    mock_supabase_auth["sign_in"].return_value = AuthSession(
        access_token="mock_access_token",
        refresh_token="mock_refresh_token",
        expires_in=3600,
        user=mock_user
    )

    response = client.post("/api/v1/auth/login", json={
        "email": "evelyn@lumina.ai",
        "password": "validpassword"
    })
    
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert data["data"]["access_token"] == "mock_access_token"
    assert data["data"]["user"]["id"] == mock_user["id"]

def test_signup_flow(client, mock_supabase_auth):
    mock_user = {
        "id": "33333333-3333-3333-3333-333333333333",
        "email": "new@lumina.ai",
        "user_metadata": {"name": "New User"}
    }
    mock_supabase_auth["sign_up"].return_value = AuthSession(
        access_token="mock_access_token",
        refresh_token="mock_refresh_token",
        expires_in=3600,
        user=mock_user
    )

    response = client.post("/api/v1/auth/signup", json={
        "fullName": "New User",
        "email": "new@lumina.ai",
        "password": "strongpassword123"
    })

    assert response.status_code == 201
    data = response.json()
    assert "data" in data
    assert data["data"]["user"]["email"] == "new@lumina.ai"

def test_get_current_user_me(client, auth_headers):
    response = client.get("/api/v1/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert data["data"]["email"] == "evelyn@lumina.ai"

def test_auth_unauthorized(client):
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
