"""Tests for OpenAI Realtime API endpoints (spike: alternative interviewer pipeline)."""

import json
from unittest.mock import patch, AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import Settings


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


def test_get_session_unauthorized_when_secrets_configured(client):
    """Session endpoint should reject missing token when auth is configured."""
    with patch("app.api.openai_realtime.get_settings") as mock_settings:
        settings = Settings()
        settings.session_shared_secrets = "secret1,secret2"
        settings.openai_api_key = "test-key"
        mock_settings.return_value = settings

        response = client.get("/api/openai-realtime/session")
        assert response.status_code == 401


def test_get_session_accepted_with_valid_token(client):
    """Session endpoint should accept correct token."""
    with patch("app.api.openai_realtime.get_settings") as mock_settings:
        settings = Settings()
        settings.session_shared_secrets = "secret1,secret2"
        settings.openai_api_key = "test-key"
        mock_settings.return_value = settings

        with patch("app.api.openai_realtime.mint_ephemeral_session", new_callable=AsyncMock) as mock_mint:
            mock_mint.return_value = {
                "id": "session-123",
                "client_secret": {
                    "value": "ephemeral-token-abc",
                    "expires_at": 1234567890,
                },
            }

            response = client.get("/api/openai-realtime/session?token=secret1")
            assert response.status_code == 200
            data = response.json()
            assert data["session_id"] == "session-123"
            assert data["ephemeral_key"] == "ephemeral-token-abc"


def test_get_session_no_auth_required_when_empty(client):
    """Session endpoint should not require token when auth is not configured."""
    with patch("app.api.openai_realtime.get_settings") as mock_settings:
        settings = Settings()
        settings.session_shared_secrets = ""  # Empty auth
        settings.openai_api_key = "test-key"
        mock_settings.return_value = settings

        with patch("app.api.openai_realtime.mint_ephemeral_session", new_callable=AsyncMock) as mock_mint:
            mock_mint.return_value = {
                "id": "session-123",
                "client_secret": {
                    "value": "ephemeral-token-abc",
                    "expires_at": 1234567890,
                },
            }

            response = client.get("/api/openai-realtime/session")
            assert response.status_code == 200


def test_get_session_missing_api_key(client):
    """Session endpoint should fail gracefully if OPENAI_API_KEY is not set."""
    with patch("app.api.openai_realtime.get_settings") as mock_settings:
        settings = Settings()
        settings.openai_api_key = None  # No key configured
        mock_settings.return_value = settings

        response = client.get("/api/openai-realtime/session")
        assert response.status_code == 500
        assert "OPENAI_API_KEY not configured" in response.json()["detail"]


def test_post_review_unauthorized(client):
    """Review endpoint should reject missing token when auth is configured."""
    with patch("app.api.openai_realtime.get_settings") as mock_settings:
        settings = Settings()
        settings.session_shared_secrets = "secret1"
        mock_settings.return_value = settings

        response = client.post(
            "/api/openai-realtime/review",
            json={
                "problem": {
                    "slug": "test-problem",
                    "number": "1",
                    "title": "Test",
                    "difficulty": "Easy",
                    "description": "Test description",
                },
                "language": "python",
                "transcript": [],
                "started_at": 1000.0,
            },
        )
        assert response.status_code == 401


def test_post_review_with_transcript(client):
    """Review endpoint should accept valid review request."""
    with patch("app.api.openai_realtime.get_settings") as mock_settings:
        settings = Settings()
        settings.session_shared_secrets = ""  # No auth
        mock_settings.return_value = settings

        with patch("app.api.openai_realtime.get_llm_provider") as mock_llm:
            with patch("app.api.openai_realtime.generate_final_review", new_callable=AsyncMock) as mock_review:
                mock_review.return_value = {
                    "overall_score": 75.0,
                    "rubric": {
                        "clarifying": 80,
                        "approach": 70,
                        "code_quality": 75,
                        "complexity": 70,
                        "communication": 80,
                        "testing": 60,
                    },
                    "strengths": [],
                    "areas_to_improve": [],
                    "timeline": [],
                    "evidence": [],
                }

                response = client.post(
                    "/api/openai-realtime/review",
                    json={
                        "problem": {
                            "slug": "two-sum",
                            "number": "1",
                            "title": "Two Sum",
                            "difficulty": "Easy",
                            "description": "Find two numbers that add up to target",
                        },
                        "language": "python",
                        "transcript": [
                            {
                                "speaker": "candidate",
                                "text": "I think we can use a hash map",
                                "timestamp": 10.0,
                            },
                            {
                                "speaker": "interviewer",
                                "text": "Good, can you walk me through that?",
                                "timestamp": 20.0,
                            },
                        ],
                        "started_at": 1000.0,
                    },
                )

                assert response.status_code == 200
                data = response.json()
                assert data["overall_score"] == 75.0
                assert data["rubric"]["clarifying"] == 80
