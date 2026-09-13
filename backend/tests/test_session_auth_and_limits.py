"""Feature 17 deployment-only safeguards: shared-secret auth at the
WebSocket handshake, a concurrent-session cap, and a hard session-duration
cap. All three default to off (see app/config.py) so these tests exercise
them by overriding `Settings` per-test, the same pattern already used in
test_websocket_interview.py (`monkeypatch` + `model_copy`, not env vars).
"""

import pytest
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketDisconnect

import app.websocket.interview as ws_module
from app.main import app

client = TestClient(app)

PROBLEM = {
    "slug": "two-sum",
    "number": "1",
    "title": "Two Sum",
    "difficulty": "Easy",
    "description": "Given an array of integers, return indices of two numbers that sum to target.",
}


@pytest.fixture(autouse=True)
def _isolated_session_registry():
    # `sessions` is a module-level singleton (by design — a session must
    # outlive the connection that created it, see websocket/interview.py),
    # so it otherwise accumulates sessions across every test in the process.
    # The capacity-cap tests below need an exact count, so give each test in
    # this file a clean registry rather than a shared one.
    ws_module.sessions._sessions.clear()


def _start_session(ws) -> str:
    ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
    started = ws.receive_json()
    assert started["type"] == "session.started"
    ws.receive_json()  # interviewer.state (intro)
    return started["session_id"]


# --- Shared-secret auth ---------------------------------------------------


def test_no_secret_configured_allows_any_connection():
    # Default settings (no session_shared_secrets) — today's behaviour must
    # not change for local dev / the rest of the test suite.
    with client.websocket_connect("/ws/interview") as ws:
        _start_session(ws)


def test_connection_rejected_without_token_when_secret_configured(monkeypatch):
    real_settings = ws_module.get_settings()
    fake_settings = real_settings.model_copy(update={"session_shared_secrets": "s3cr3t"})
    monkeypatch.setattr(ws_module, "get_settings", lambda: fake_settings)

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/interview"):
            pass
    assert exc_info.value.code == 4401


def test_connection_rejected_with_wrong_token(monkeypatch):
    real_settings = ws_module.get_settings()
    fake_settings = real_settings.model_copy(update={"session_shared_secrets": "s3cr3t"})
    monkeypatch.setattr(ws_module, "get_settings", lambda: fake_settings)

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/interview?token=wrong"):
            pass
    assert exc_info.value.code == 4401


def test_connection_accepted_with_correct_token_from_a_multi_value_list(monkeypatch):
    real_settings = ws_module.get_settings()
    fake_settings = real_settings.model_copy(
        update={"session_shared_secrets": "team-a-code, team-b-code"}
    )
    monkeypatch.setattr(ws_module, "get_settings", lambda: fake_settings)

    with client.websocket_connect("/ws/interview?token=team-b-code") as ws:
        _start_session(ws)


# --- Concurrent-session cap ------------------------------------------------


def test_capacity_cap_rejects_new_session_start_once_full(monkeypatch):
    real_settings = ws_module.get_settings()
    fake_settings = real_settings.model_copy(update={"max_concurrent_sessions": 1})
    monkeypatch.setattr(ws_module, "get_settings", lambda: fake_settings)

    with client.websocket_connect("/ws/interview") as ws1:
        _start_session(ws1)

        with client.websocket_connect("/ws/interview") as ws2:
            ws2.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
            error = ws2.receive_json()
            assert error["type"] == "error"
            assert error["code"] == "capacity_reached"
            assert error["recoverable"] is True


def test_capacity_cap_does_not_block_resuming_an_existing_session(monkeypatch):
    real_settings = ws_module.get_settings()
    fake_settings = real_settings.model_copy(update={"max_concurrent_sessions": 1})
    monkeypatch.setattr(ws_module, "get_settings", lambda: fake_settings)

    with client.websocket_connect("/ws/interview") as ws1:
        session_id = _start_session(ws1)

    # First connection closed; resuming the same session must still work
    # even though active_count() still reports it as live within its grace
    # window — resume reuses the existing record rather than creating one.
    with client.websocket_connect("/ws/interview") as ws2:
        ws2.send_json({"type": "session.resume", "session_id": session_id, "last_seq": 0})
        # Replays buffered events (session.started, interviewer.state) rather
        # than erroring — proves capacity wasn't (mis)applied to resume.
        first = ws2.receive_json()
        assert first["type"] == "session.started"


# --- Max session duration ---------------------------------------------------


def test_session_force_ended_after_max_duration(monkeypatch):
    real_settings = ws_module.get_settings()
    fake_settings = real_settings.model_copy(update={"session_max_duration_seconds": 60})
    monkeypatch.setattr(ws_module, "get_settings", lambda: fake_settings)

    with client.websocket_connect("/ws/interview") as ws:
        session_id = _start_session(ws)

        record = ws_module.sessions.get(session_id)
        assert record is not None
        record.created_at -= 3600  # force well past the 60s cap

        ws.send_json(
            {"type": "code.update", "language": "python", "code": "x = 1", "timestamp": 0}
        )

        stage_event = ws.receive_json()
        assert stage_event["type"] == "interviewer.state"
        assert stage_event["stage"] == "review"

        error = ws.receive_json()
        assert error["type"] == "error"
        assert error["code"] == "session_time_limit"
        assert error["recoverable"] is False

        # Hard-capped sessions must not be resumable afterwards.
        assert ws_module.sessions.get(session_id) is None
