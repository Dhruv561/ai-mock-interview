"""Tests for Gemini Live API endpoints (spike)."""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.interview.schemas import ProblemInfo
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def reset_settings(monkeypatch):
    """Reset and reload settings for each test."""
    yield
    # Clear the cache after each test to avoid state leakage
    get_settings.cache_clear()


class TestGeminiLiveToken:
    """Tests for GET /api/gemini-live/token endpoint."""

    def test_token_missing_api_key(self, client, monkeypatch, reset_settings):
        """Fails clearly when GEMINI_API_KEY is not configured."""
        monkeypatch.setenv("GEMINI_API_KEY", "")
        get_settings.cache_clear()

        response = client.get("/api/gemini-live/token")
        assert response.status_code == 500
        assert "GEMINI_API_KEY" in response.json()["detail"]

    def test_token_auth_required(self, client, monkeypatch, reset_settings):
        """Rejects request when auth is gated and no token provided."""
        monkeypatch.setenv("SESSION_SHARED_SECRETS", "secret1,secret2")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        get_settings.cache_clear()

        response = client.get("/api/gemini-live/token")
        assert response.status_code == 403

    def test_token_auth_invalid(self, client, monkeypatch, reset_settings):
        """Rejects request with wrong token when auth is gated."""
        monkeypatch.setenv("SESSION_SHARED_SECRETS", "secret1,secret2")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        get_settings.cache_clear()

        response = client.get("/api/gemini-live/token?token=wrong-secret")
        assert response.status_code == 403

    def test_token_auth_valid(self, client, monkeypatch, reset_settings):
        """Accepts request with correct token when auth is gated."""
        monkeypatch.setenv("SESSION_SHARED_SECRETS", "secret1,secret2")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        get_settings.cache_clear()

        # Mock the ephemeral token fetch to avoid real API calls
        def mock_get_ephemeral_token(api_key, model):
            import asyncio

            async def _mock():
                return "mock-ephemeral-token"

            return asyncio.create_task(_mock())

        monkeypatch.setattr(
            "app.api.gemini_live.get_ephemeral_token",
            mock_get_ephemeral_token,
        )

        response = client.get("/api/gemini-live/token?token=secret1")
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "ws_url" in data
        assert "model" in data


class TestGeminiLiveReview:
    """Tests for POST /api/gemini-live/review endpoint."""


    def test_review_auth_required(self, client, monkeypatch, reset_settings):
        """Rejects request when auth is gated and no token provided."""
        monkeypatch.setenv("SESSION_SHARED_SECRETS", "secret1")
        get_settings.cache_clear()

        problem = ProblemInfo(
            slug="two-sum",
            number="1",
            title="Two Sum",
            difficulty="Easy",
            description="Find two numbers that add to target",
        )

        body = {
            "problem": problem.model_dump(),
            "language": "python",
            "transcript": [],
            "started_at": 0.0,
        }

        response = client.post("/api/gemini-live/review", json=body)
        assert response.status_code == 403

    def test_review_invalid_speaker(self, client):
        """Rejects transcript with invalid speaker value."""
        problem = ProblemInfo(
            slug="two-sum",
            number="1",
            title="Two Sum",
            difficulty="Easy",
            description="Find two numbers that add to target",
        )

        body = {
            "problem": problem.model_dump(),
            "language": "python",
            "transcript": [
                {
                    "speaker": "invalid",
                    "text": "Some text",
                    "timestamp": 1.0,
                }
            ],
            "started_at": 0.0,
        }

        response = client.post("/api/gemini-live/review", json=body)
        assert response.status_code == 422  # Validation error

    def test_review_valid(self, client, monkeypatch, reset_settings):
        """Accepts valid review request with mock LLM provider."""
        monkeypatch.setenv("USE_MOCK_PROVIDERS", "true")
        get_settings.cache_clear()

        problem = ProblemInfo(
            slug="two-sum",
            number="1",
            title="Two Sum",
            difficulty="Easy",
            description="Find two numbers that add to target",
        )

        body = {
            "problem": problem.model_dump(),
            "language": "python",
            "transcript": [
                {
                    "speaker": "candidate",
                    "text": "I'll use a hash map",
                    "timestamp": 1.0,
                },
                {
                    "speaker": "interviewer",
                    "text": "Good approach",
                    "timestamp": 2.0,
                },
            ],
            "started_at": 0.0,
        }

        response = client.post("/api/gemini-live/review", json=body)
        assert response.status_code == 200
        data = response.json()
        assert "strengths" in data
        assert "areas_to_improve" in data
