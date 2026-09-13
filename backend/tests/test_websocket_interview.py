from fastapi.testclient import TestClient

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


def test_session_start_returns_session_started_then_interviewer_state():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        event = ws.receive_json()
        assert event["type"] == "session.started"
        assert isinstance(event["session_id"], str) and event["session_id"]
        assert event["seq"] == 1

        stage_event = ws.receive_json()
        assert stage_event["type"] == "interviewer.state"
        assert stage_event["stage"] == "intro"
        assert stage_event["seq"] == 2


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
        ws.receive_json()  # interviewer.state


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
        stage_event = ws.receive_json()  # interviewer.state — the actual last seq seen

    with client.websocket_connect("/ws/interview") as ws2:
        last_seq = stage_event["seq"]
        resume = {"type": "session.resume", "session_id": session_id, "last_seq": last_seq}
        ws2.send_json(resume)
        # nothing new to replay — the next thing on the wire is a live response.
        # screen.recording.started has no server response (unlike hint.requested,
        # which now triggers the interviewer agent as of Feature 08), so it's
        # safe filler that proves no stale replay was queued ahead of it.
        ws2.send_json({"type": "screen.recording.started"})
        ws2.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        error = ws2.receive_json()
        assert error["code"] == "session_not_found"


def test_resume_unknown_session_is_rejected():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        error = ws.receive_json()
        assert error["code"] == "session_not_found"


def test_audio_chunk_before_session_start_is_rejected():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_bytes(b"\x00\x01\x02")
        error = ws.receive_json()
        assert error["code"] == "no_active_session"


def test_audio_chunks_reach_the_mock_stt_session():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state

        ws.send_bytes(b"fake-opus-bytes-1")
        ws.send_bytes(b"fake-opus-bytes-2")

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.stt_session is not None
    assert record.stt_session.chunks_received == 2


def test_dev_simulate_transcript_produces_partial_then_final():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()  # session.started
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state

        ws.send_json({"type": "dev.simulate_transcript", "text": "I'd use a hash map here."})

        partial = ws.receive_json()
        assert partial["type"] == "transcript.partial"
        assert partial["text"] == "I'd use a hash map here."

        final = ws.receive_json()
        assert final["type"] == "transcript.final"
        assert final["text"] == "I'd use a hash map here."
        assert isinstance(final["timestamp"], float)

        # the mock interviewer responds to the transcript_final trigger at
        # the default "intro" stage (Feature 08) — a real, not simulated,
        # end-to-end pass through agent + controller
        interviewer_reply = ws.receive_json()
        assert interviewer_reply["type"] == "interviewer.transcript"
        assert interviewer_reply["text"]

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert len(record.state.transcript) == 2
    assert record.state.transcript[0].speaker == "candidate"
    assert record.state.transcript[0].text == "I'd use a hash map here."
    assert record.state.transcript[1].speaker == "interviewer"
    assert record.state.transcript[0].speaker == "candidate"
    assert record.state.transcript[0].text == "I'd use a hash map here."


def test_dev_simulate_transcript_rejected_when_mock_providers_disabled(monkeypatch):
    real_settings = ws_module.get_settings()
    fake_settings = real_settings.model_copy(update={"use_mock_providers": False})
    monkeypatch.setattr(ws_module, "get_settings", lambda: fake_settings)

    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        ws.receive_json()  # session.started
        ws.receive_json()  # interviewer.state

        ws.send_json({"type": "dev.simulate_transcript", "text": "hello"})
        error = ws.receive_json()
        assert error["code"] == "mock_only"


def test_stt_provider_start_failure_degrades_gracefully(monkeypatch):
    class FailingProvider:
        async def start_session(self, on_partial, on_final):
            raise ConnectionError("provider unreachable")

    monkeypatch.setattr(ws_module, "get_stt_provider", lambda settings: FailingProvider())

    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        # session still starts even though the STT provider couldn't connect
        assert started["type"] == "session.started"
        ws.receive_json()  # interviewer.state

        # audio can still be sent — it's just silently dropped, not fatal
        ws.send_bytes(b"some-audio")

        # the connection is still alive and processing messages afterward
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        error = ws.receive_json()
        assert error["code"] == "session_not_found"


def test_code_update_and_hint_requested_persist_into_session_state():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state

        ws.send_json(
            {"type": "code.update", "language": "cpp", "code": "int main() {}", "timestamp": 1.0}
        )
        ws.send_json({"type": "hint.requested"})
        ws.send_json({"type": "hint.requested"})

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.state.current_code == "int main() {}"
    assert record.state.language == "cpp"
    assert record.state.hint_level == 2


def test_code_update_populates_code_analysis_observations():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state (intro)

        nested_loop_code = (
            "def brute_force(nums):\n"
            "    for i in range(len(nums)):\n"
            "        for j in range(len(nums)):\n"
            "            pass\n"
        )
        ws.send_json(
            {
                "type": "code.update",
                "language": "python",
                "code": nested_loop_code,
                "timestamp": 1.0,
            }
        )
        ws.receive_json()  # interviewer.transcript (Feature 08's mock interviewer)

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.state.code_analysis_observations
    assert any("nested loop" in o.lower() for o in record.state.code_analysis_observations)


def test_code_update_with_non_python_language_yields_no_observations():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "cpp"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state (intro)

        ws.send_json(
            {"type": "code.update", "language": "cpp", "code": "int main() {}", "timestamp": 1.0}
        )
        ws.receive_json()  # interviewer.transcript

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.state.code_analysis_observations == []


def test_session_end_transitions_to_review_and_is_idempotent():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state (intro)

        ws.send_json({"type": "session.end"})
        stage_event = ws.receive_json()
        assert stage_event["type"] == "interviewer.state"
        assert stage_event["stage"] == "review"

        # a second session.end must not crash or emit a duplicate transition
        ws.send_json({"type": "session.end"})
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        error = ws.receive_json()
        assert error["code"] == "session_not_found"

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.state.stage == "review"


def test_code_update_triggers_the_mock_interviewer_at_intro_stage():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state (intro)

        ws.send_json(
            {"type": "code.update", "language": "python", "code": "def f(): pass", "timestamp": 1.0}
        )
        reply = ws.receive_json()
        assert reply["type"] == "interviewer.transcript"
        assert reply["text"]

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.state.recent_interviewer_actions  # the question was recorded to avoid repeats


def test_hint_requested_produces_a_hint_response_and_increments_hint_level():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state (intro)

        ws.send_json({"type": "hint.requested"})
        reply = ws.receive_json()
        assert reply["type"] == "hint.response"
        assert reply["level"] == 1
        assert reply["text"]

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.state.hint_level == 1


def test_hint_requested_bypasses_cooldown_but_is_still_capped_at_level_3():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state (intro)

        # three hint requests back-to-back — cooldown would normally block
        # everything after the first, but hint.requested is exempt (§L rule 2)
        for _ in range(3):
            ws.send_json({"type": "hint.requested"})
            reply = ws.receive_json()
            assert reply["type"] == "hint.response"
            # Feature 10: every hint.response is bracketed by a (mock, in
            # this test run) TTS audio stream — see test_interviewer_audio.py
            assert ws.receive_json()["type"] == "interviewer.audio.start"
            assert ws.receive_json()["type"] == "interviewer.audio.end"

        # a fourth is silently refused — no fourth message on the wire.
        # prove it by sending something with a real response and checking
        # that arrives next, not a stray hint.response.
        ws.send_json({"type": "hint.requested"})
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        next_message = ws.receive_json()
        assert next_message["code"] == "session_not_found"

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.state.hint_level == 3


def test_cooldown_prevents_a_second_interviewer_response_immediately_after_the_first():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state (intro)

        ws.send_json(
            {"type": "code.update", "language": "python", "code": "def f(): pass", "timestamp": 1.0}
        )
        first_reply = ws.receive_json()
        assert first_reply["type"] == "interviewer.transcript"
        # Feature 10: the reply is bracketed by a (mock, in this test run)
        # TTS audio stream — see test_interviewer_audio.py
        assert ws.receive_json()["type"] == "interviewer.audio.start"
        assert ws.receive_json()["type"] == "interviewer.audio.end"

        # immediately triggering again is within the cooldown window — no
        # second interviewer.transcript arrives; prove it the same way as
        # above, with a distinguishable message that does get a reply.
        second_update = {
            "type": "code.update",
            "language": "python",
            "code": "def f(): return 1",
            "timestamp": 2.0,
        }
        ws.send_json(second_update)
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        next_message = ws.receive_json()
        assert next_message["code"] == "session_not_found"

    record = ws_module.sessions.get(session_id)
    assert record is not None
    # only the first code.update's question was ever recorded
    assert len(record.state.recent_interviewer_actions) == 1


def test_review_stage_never_speaks_again():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state (intro)

        ws.send_json({"type": "session.end"})
        stage_event = ws.receive_json()
        assert stage_event["stage"] == "review"

        ws.send_json(
            {"type": "code.update", "language": "python", "code": "def f(): pass", "timestamp": 1.0}
        )
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        next_message = ws.receive_json()
        assert next_message["code"] == "session_not_found"

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.state.recent_interviewer_actions == []
