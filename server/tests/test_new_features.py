import pytest
from unittest.mock import patch, MagicMock
from app.integrations.supabase_auth import AuthSession


def test_global_search_endpoint(client, auth_headers):
    # Search with query string
    resp = client.get("/api/v1/search?q=quantum", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    data = body["data"]
    assert "documents" in data
    assert "topics" in data
    assert "concepts" in data
    assert "chunks" in data
    assert "total_matches" in data


def test_subscription_status_and_upgrade(client, auth_headers):
    # Check status
    status_resp = client.get("/api/v1/subscription/status", headers=auth_headers)
    assert status_resp.status_code == 200
    s_data = status_resp.json()["data"]
    assert "subscription" in s_data
    assert "tier_details" in s_data

    # Upgrade to pro
    upgrade_resp = client.post(
        "/api/v1/subscription/upgrade",
        json={"tier": "pro"},
        headers=auth_headers,
    )
    assert upgrade_resp.status_code == 200
    u_data = upgrade_resp.json()["data"]
    assert u_data["subscription"] == "pro"

    # Verify status after upgrade
    status_resp2 = client.get("/api/v1/subscription/status", headers=auth_headers)
    assert status_resp2.json()["data"]["is_pro"] is True


def test_device_token_registration(client, auth_headers):
    # Register token
    reg_resp = client.post(
        "/api/v1/notifications/tokens",
        json={"token": "ExponentPushToken[test-12345]", "platform": "android"},
        headers=auth_headers,
    )
    assert reg_resp.status_code == 201
    assert reg_resp.json()["data"]["registered"] is True

    # Unregister token
    unreg_resp = client.request(
        "DELETE",
        "/api/v1/notifications/tokens",
        json={"token": "ExponentPushToken[test-12345]"},
        headers=auth_headers,
    )
    assert unreg_resp.status_code == 200
    assert unreg_resp.json()["data"]["unregistered"] is True


def test_profile_avatar_flow(client, auth_headers):
    # Upload avatar image
    avatar_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    files = {"file": ("avatar.png", avatar_bytes, "image/png")}
    
    upload_resp = client.post("/api/v1/profile/avatar", files=files, headers=auth_headers)
    assert upload_resp.status_code == 200
    profile_data = upload_resp.json()["data"]
    assert profile_data["avatar_url"] is not None

    # Delete avatar image
    del_resp = client.delete("/api/v1/profile/avatar", headers=auth_headers)
    assert del_resp.status_code == 200
    assert del_resp.json()["data"]["avatar_url"] is None


def test_google_oauth_endpoints(client):
    # GET Google OAuth URL
    url_resp = client.get("/api/v1/auth/google/url?redirectTo=http://localhost:8081")
    assert url_resp.status_code == 200
    assert "authorize?provider=google" in url_resp.json()["data"]["url"]

    # POST Google OAuth exchange
    mock_session = AuthSession(
        access_token="mock_access_token_google",
        refresh_token="mock_refresh_token_google",
        user={"id": "00000000-0000-0000-0000-000000000001", "email": "test@google.com"},
    )
    with patch("app.integrations.supabase_auth.sign_in_with_id_token", return_value=mock_session):
        google_resp = client.post("/api/v1/auth/google", json={"idToken": "fake_google_id_token"})
        assert google_resp.status_code == 200
        assert google_resp.json()["data"]["access_token"] == "mock_access_token_google"
