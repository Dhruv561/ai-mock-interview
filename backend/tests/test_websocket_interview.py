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


def test_session_start_returns_session_started():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        event = ws.receive_json()
        assert event["type"] == "session.started"
        assert isinstance(event["session_id"], str) and event["session_id"]
        assert event["seq"] == 1


def test_malformed_json_is_rejected_without_closing_the_connection():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_text("not valid json {")
        error = ws.receive_json()
        assert error["type"] == "error"
        assert error["code"] == "invalid_json"
        assert error["recoverable"] is True

        # connection must still be usable afterwards
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        event = ws.receive_json()
        assert event["type"] == "session.started"


def test_unknown_event_type_is_rejected():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "not.a.real.event"})
        error = ws.receive_json()
        assert error["type"] == "error"
        assert error["code"] == "invalid_event"


def test_missing_required_field_is_rejected():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM})  # no language
        error = ws.receive_json()
        assert error["type"] == "error"
        assert error["code"] == "invalid_event"


def test_event_before_session_start_is_rejected():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "hint.requested"})
        error = ws.receive_json()
        assert error["code"] == "no_active_session"


def test_resume_replays_missed_events():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]

    with client.websocket_connect("/ws/interview") as ws2:
        ws2.send_json({"type": "session.resume", "session_id": session_id, "last_seq": 0})
        replayed = ws2.receive_json()
        assert replayed["type"] == "session.started"
        assert replayed["session_id"] == session_id
        assert replayed["seq"] == 1


def test_resume_does_not_replay_already_seen_events():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]

    with client.websocket_connect("/ws/interview") as ws2:
        resume = {"type": "session.resume", "session_id": session_id, "last_seq": started["seq"]}
        ws2.send_json(resume)
        # nothing new to replay — the next thing on the wire is a live response
        ws2.send_json({"type": "hint.requested"})
        # hint.requested has no server response yet, so send something that
        # does to prove no stale replay was queued ahead of it.
        ws2.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        error = ws2.receive_json()
        assert error["code"] == "session_not_found"


def test_resume_unknown_session_is_rejected():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        error = ws.receive_json()
        assert error["code"] == "session_not_found"
