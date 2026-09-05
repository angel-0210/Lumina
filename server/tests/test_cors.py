import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_cors_preflight_auth_refresh():
    origin = "https://lumina-delta-lake.vercel.app"
    response = client.options(
        "/api/v1/auth/refresh",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin
    assert response.headers.get("access-control-allow-credentials") == "true"
    assert "POST" in response.headers.get("access-control-allow-methods", "")

def test_cors_actual_request_header():
    origin = "https://lumina-delta-lake.vercel.app"
    response = client.post(
        "/api/v1/auth/refresh",
        json={"refreshToken": "dummy_token"},
        headers={"Origin": origin},
    )
    assert response.headers.get("access-control-allow-origin") == origin
    assert response.headers.get("access-control-allow-credentials") == "true"
