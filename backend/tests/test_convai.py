from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

PROBLEM = {
    "slug": "two-sum",
    "number": "1",
    "title": "Two Sum",
    "difficulty": "Easy",
    "description": "Given an array of integers, return indices of two numbers that sum to target.",
}


def test_convai_review_includes_stage_and_hint_evidence():
    response = client.post(
        "/api/convai/review",
        json={
            "problem": PROBLEM,
            "language": "python",
            "transcript": [
                {"speaker": "interviewer", "text": "Walk me through it.", "timestamp": 1.0},
                {"speaker": "candidate", "text": "I'll use a hash map.", "timestamp": 2.0},
            ],
            "hints": [
                {"level": 1, "text": "Think about faster lookups.", "timestamp": 3.0},
            ],
            "stage_history": [
                {"stage": "clarification", "timestamp": 4.0},
                {"stage": "coding", "timestamp": 12.0},
            ],
            "started_at": 0.0,
        },
    )

    assert response.status_code == 200
    body = response.json()

    assert [event["label"] for event in body["timeline"]] == ["clarification", "coding"]
    assert {item["kind"] for item in body["evidence"]} >= {"hint", "stage", "transcript"}


def test_convai_code_analysis_endpoint_uses_legacy_analyser():
    response = client.post(
        "/api/convai/analyse-code",
        json={
            "code": (
                "def brute_force(nums):\n"
                "    for i in range(len(nums)):\n"
                "        for j in range(len(nums)):\n"
                "            pass\n"
            ),
            "language": "python",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert any("nested loop" in observation.lower() for observation in body["observations"])


def test_convai_review_includes_code_analysis_evidence():
    response = client.post(
        "/api/convai/review",
        json={
            "problem": PROBLEM,
            "language": "python",
            "transcript": [
                {"speaker": "candidate", "text": "I'll use a hash map.", "timestamp": 2.0},
            ],
            "code_analysis_observations": ["Nested loop detected (outer loop at line 2)."],
            "current_code": "def brute_force(nums):\n    for i in nums:\n        return i\n",
            "hints": [],
            "stage_history": [],
            "started_at": 0.0,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert any(item["kind"] == "code_analysis" for item in body["evidence"])