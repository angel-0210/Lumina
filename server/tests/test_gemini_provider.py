import pytest
from unittest.mock import patch, MagicMock
import httpx
from app.ai import gemini_provider
from app.core.exceptions import ProviderError

def test_generate_image_success():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": "image/png",
                                "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
                            }
                        }
                    ]
                }
            }
        ]
    }

    with patch("httpx.Client.post", return_value=mock_response) as mock_post:
        result = gemini_provider.generate_image("A beautiful scenery", aspect_ratio="16:9")
        assert result.mime_type == "image/png"
        assert len(result.image_bytes) > 0
        
        # Verify the post parameters
        args, kwargs = mock_post.call_args
        assert kwargs["json"]["generationConfig"]["responseModalities"] == ["IMAGE"]
        assert kwargs["json"]["generationConfig"]["imageConfig"]["aspectRatio"] == "16:9"

def test_generate_image_api_error():
    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.json.return_value = {
        "error": {
            "code": 400,
            "status": "INVALID_ARGUMENT",
            "message": "Invalid JSON payload"
        }
    }
    
    with patch("httpx.Client.post", return_value=mock_response):
        with pytest.raises(ProviderError) as exc_info:
            gemini_provider.generate_image("Invalid prompt")
        assert exc_info.value.message == "The service is temporarily unavailable. Please try again shortly."
