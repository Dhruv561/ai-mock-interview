import asyncio

from fastapi.testclient import TestClient

import app.websocket.interview as ws_module
from app.config import get_settings
from app.interview.actions import InterviewerAction
from app.interview.schemas import FinalReview, ProblemInfo
from app.interview.state import TranscriptEntry
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
        # The WS receive loop processes messages strictly in order, so
        # waiting for a reply to this next message guarantees both audio
        # frames above were already handled — needed because the ASGI app
        # runs on a background thread and send_bytes doesn't itself block
        # until the server has processed it.
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        error = ws.receive_json()
        assert error["code"] == "session_not_found"

        # Checked while still connected: on disconnect the STT session is
        # now closed (Feature 20 cleanup — see
        # _close_stt_session_on_disconnect), so this must be observed
        # before the `with` block exits, not after.
        record = ws_module.sessions.get(session_id)
        assert record is not None
        assert record.stt_session is not None
        assert record.stt_session.chunks_received == 2

    # Feature 20 cleanup: the STT session is closed once the client
    # actually disconnects, rather than being leaked open for the rest of
    # the session's grace window (see _close_stt_session_on_disconnect).
    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.stt_session is None


def test_resume_reopens_stt_session_closed_by_the_previous_disconnect():
    """A disconnect closes the STT session (see the test above); a
    resumed connection must transcribe again rather than silently losing
    STT for the rest of the interview (Feature 20 cleanup)."""
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.stt_session is None  # closed by the disconnect above

    with client.websocket_connect("/ws/interview") as ws2:
        ws2.send_json({"type": "session.resume", "session_id": session_id, "last_seq": 0})
        ws2.receive_json()  # session.started replay

        record = ws_module.sessions.get(session_id)
        assert record is not None
        assert record.stt_session is not None


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


def test_stt_send_failure_degrades_gracefully(monkeypatch):
    """architecture.md §V: distinct from the start-failure test above — here
    the STT connection succeeds initially, then a later send_audio() call on
    an already-established session fails (the provider dropped mid-session).
    That must emit `error {code: "stt_unavailable"}`, clear stt_session (so
    later audio is silently dropped, not fatal), and keep the WS session
    alive — none of that behavior was covered anywhere before this test."""

    class FailingSession:
        async def send_audio(self, chunk: bytes) -> None:
            raise ConnectionError("upstream dropped")

        async def close(self) -> None:
            pass

    class OneShotProvider:
        async def start_session(self, on_partial, on_final):
            return FailingSession()

    monkeypatch.setattr(ws_module, "get_stt_provider", lambda settings: OneShotProvider())

    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        assert started["type"] == "session.started"
        ws.receive_json()  # interviewer.state

        ws.send_bytes(b"some-audio")
        error = ws.receive_json()
        assert error["type"] == "error"
        assert error["code"] == "stt_unavailable"
        assert error["recoverable"] is True

        record = ws_module.sessions.get(session_id)
        assert record is not None
        assert record.stt_session is None

        # a further audio frame is now just silently dropped, not fatal —
        # proven by the connection still being usable afterward
        ws.send_bytes(b"more-audio")
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        not_found = ws.receive_json()
        assert not_found["code"] == "session_not_found"


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

        review_event = ws.receive_json()
        assert review_event["type"] == "review.ready"

        # a second session.end must not crash, emit a duplicate transition,
        # or regenerate/re-emit a second review
        ws.send_json({"type": "session.end"})
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        error = ws.receive_json()
        assert error["code"] == "session_not_found"

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.state.stage == "review"


def test_persistence_repository_is_called_across_session_lifecycle(monkeypatch):
    """Feature 15 / architecture.md §Q: `_emit`'s single chokepoint calls
    `append_event` for every event a session emits, session.start calls
    `create_session` once, and a successfully generated review calls
    `save_final_review` once — all fire-and-forget (see `_persist`), which
    this asserts on indirectly by checking call counts after the socket
    closes rather than by awaiting the writes directly."""
    calls = {"create_session": 0, "append_event": 0, "save_final_review": 0}

    class FakeRepository:
        async def create_session(self, session_id, problem, language, started_at):
            calls["create_session"] += 1

        async def append_event(self, session_id, event):
            calls["append_event"] += 1

        async def save_final_review(self, session_id, review):
            calls["save_final_review"] += 1

        async def get_session(self, session_id):
            return None

    monkeypatch.setattr(ws_module, "get_repository", lambda settings: FakeRepository())

    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        ws.receive_json()  # session.started
        ws.receive_json()  # interviewer.state (intro)

        ws.send_json({"type": "session.end"})
        ws.receive_json()  # interviewer.state (review)
        ws.receive_json()  # review.ready

    assert calls["create_session"] == 1
    # session.started, interviewer.state (intro), interviewer.state
    # (review), review.ready — four events emitted across this flow.
    assert calls["append_event"] == 4
    assert calls["save_final_review"] == 1


def test_persistence_write_failure_does_not_break_the_session(monkeypatch):
    """Feature 16 hardening: TTS and STT both already have a
    failure-degrades-gracefully test (test_interviewer_audio.py,
    test_stt_provider_start_failure_degrades_gracefully above); persistence
    didn't have the equivalent for a *write* failure (only the success-path
    call-count test above). A repository whose writes always raise must
    still let the interview run to completion — `_persist`/`_run_persistence`
    are the mechanism (architecture.md §Q), this proves it end-to-end."""

    class AlwaysFailsRepository:
        async def create_session(self, session_id, problem, language, started_at):
            raise RuntimeError("db unreachable")

        async def append_event(self, session_id, event):
            raise RuntimeError("db unreachable")

        async def save_final_review(self, session_id, review):
            raise RuntimeError("db unreachable")

        async def get_session(self, session_id):
            raise RuntimeError("db unreachable")

    monkeypatch.setattr(ws_module, "get_repository", lambda settings: AlwaysFailsRepository())

    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        assert started["type"] == "session.started"
        ws.receive_json()  # interviewer.state (intro)

        ws.send_json({"type": "session.end"})
        stage_event = ws.receive_json()
        assert stage_event["stage"] == "review"
        review_event = ws.receive_json()
        assert review_event["type"] == "review.ready"


def test_full_interview_happy_path_start_to_review(monkeypatch):
    """Feature 16: TODO.md Phase 11's "full happy-path integration test:
    start -> transcript -> code_update -> question -> hint -> end ->
    review" — chained into one continuous real session, rather than split
    across several smaller tests that each start fresh (as the rest of
    this file does). The clock is monkeypatched (not real controller/state
    fixtures) so the 30s interviewer cooldown (architecture.md §L rule 1)
    is genuinely enforced across multiple real triggers in sequence,
    including asserting that an immediate same-instant retrigger produces
    silence — no existing test checks cooldown gating across more than one
    trigger in the same session.

    Stage is still advanced via a direct `record.state.stage = ...` poke
    between triggers, the same convention every other stage-dependent test
    in this file already uses: MockLLMProvider's canned responses are
    stage-keyed (providers/llm/mock.py) and it never itself proposes
    transition_stage, so nothing client-triggerable can advance the stage
    without a real LLM — poking it directly is the documented, accepted
    simplification, not new to this test.
    """
    fake_now = [1_000_000.0]
    monkeypatch.setattr(ws_module.time, "time", lambda: fake_now[0])

    calls = {"create_session": 0, "append_event": 0, "save_final_review": 0}

    class FakeRepository:
        async def create_session(self, session_id, problem, language, started_at):
            calls["create_session"] += 1

        async def append_event(self, session_id, event):
            calls["append_event"] += 1

        async def save_final_review(self, session_id, review):
            calls["save_final_review"] += 1

        async def get_session(self, session_id):
            return None

    monkeypatch.setattr(ws_module, "get_repository", lambda settings: FakeRepository())

    with client.websocket_connect("/ws/interview") as ws:
        # --- start ---
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        assert started["seq"] == 1
        stage_event = ws.receive_json()
        assert stage_event["stage"] == "intro"

        record = ws_module.sessions.get(session_id)
        assert record is not None

        # --- code_update -> question (first-ever call always passes
        # can_speak's cooldown gate, regardless of the clock) ---
        ws.send_json(
            {"type": "code.update", "language": "python", "code": "def f(): pass", "timestamp": 1.0}
        )
        question_1 = ws.receive_json()
        assert question_1["type"] == "interviewer.transcript"
        assert ws.receive_json()["type"] == "interviewer.audio.start"
        assert ws.receive_json()["type"] == "interviewer.audio.end"

        # --- transcript, same instant -> cooldown genuinely blocks a
        # reply (proves the gate applies across trigger types, not just
        # within one) ---
        ws.send_json({"type": "dev.simulate_transcript", "text": "I'd use a hash map."})
        assert ws.receive_json()["type"] == "transcript.partial"
        assert ws.receive_json()["type"] == "transcript.final"
        # No interviewer.transcript follows here. Proven by the next
        # thing off the wire, below, being the *next* event we send, not
        # a leftover reply to this one.

        # --- advance past cooldown, move to a stage with a different
        # canned response, and confirm this second question actually
        # differs from the first ---
        fake_now[0] += 31.0
        record.state.stage = "clarification"
        ws.send_json(
            {
                "type": "code.update",
                "language": "python",
                "code": "def f(): return 1",
                "timestamp": fake_now[0],
            }
        )
        question_2 = ws.receive_json()
        assert question_2["type"] == "interviewer.transcript"
        assert question_2["text"] != question_1["text"]
        assert ws.receive_json()["type"] == "interviewer.audio.start"
        assert ws.receive_json()["type"] == "interviewer.audio.end"

        # --- hint.requested bypasses cooldown entirely (§L rule 2) —
        # clock deliberately left unadvanced ---
        ws.send_json({"type": "hint.requested"})
        hint = ws.receive_json()
        assert hint["type"] == "hint.response"
        assert hint["level"] == 1
        assert ws.receive_json()["type"] == "interviewer.audio.start"
        assert ws.receive_json()["type"] == "interviewer.audio.end"
        assert record.state.hint_level == 1

        # --- advance past cooldown again, move to "complexity" so the
        # rubric-carrying canned response fires (Feature 13) ---
        fake_now[0] += 31.0
        record.state.stage = "complexity"
        ws.send_json(
            {
                "type": "code.update",
                "language": "python",
                "code": "def f(): return 2",
                "timestamp": fake_now[0],
            }
        )
        assert ws.receive_json()["type"] == "interviewer.transcript"
        assert ws.receive_json()["type"] == "interviewer.audio.start"
        assert ws.receive_json()["type"] == "interviewer.audio.end"
        rubric_event = ws.receive_json()
        assert rubric_event["type"] == "rubric.updated"
        assert rubric_event["rubric"]["complexity"] == 1

        # --- end -> review ---
        ws.send_json({"type": "session.end"})
        stage_event = ws.receive_json()
        assert stage_event["type"] == "interviewer.state"
        assert stage_event["stage"] == "review"
        review_event = ws.receive_json()
        assert review_event["type"] == "review.ready"
        # schema + evidence-id validator both pass
        FinalReview.model_validate(review_event["review"])

    assert record.state.stage == "review"
    assert calls["create_session"] == 1
    assert calls["save_final_review"] == 1
    assert calls["append_event"] == len(record.events)

    seqs = [e["seq"] for e in record.events]
    assert seqs == sorted(seqs)
    assert len(set(seqs)) == len(seqs)  # every seq unique — no double-emit anywhere in the chain


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


def test_is_candidate_speaking_blocks_the_interviewer_from_talking_over_them():
    """architecture.md §L rule 1 ("never speak while the candidate is
    mid-utterance") — regression test for the wiring gap where
    `can_speak`'s `is_candidate_speaking` parameter existed and was
    unit-tested directly (test_interview_controller.py) but had no writer
    anywhere in the WS layer (Feature 20 cleanup)."""
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state (intro)

        record = ws_module.sessions.get(session_id)
        assert record is not None
        record.is_candidate_speaking = True

        ws.send_json(
            {"type": "code.update", "language": "python", "code": "def f(): pass", "timestamp": 1.0}
        )
        # proven silent the same way the cooldown tests above do: send
        # something with a real, distinguishable response and check that
        # arrives next, not a stray interviewer.transcript.
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        next_message = ws.receive_json()
        assert next_message["code"] == "session_not_found"

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert not record.state.recent_interviewer_actions  # never spoke while "speaking"


def test_dev_simulate_transcript_clears_is_candidate_speaking_before_speaking():
    """The mock-mode dev.simulate_transcript stand-in must mirror a real
    STT provider's on_partial(True)/on_final(False) around its own
    synthetic partial+final pair, otherwise the interviewer would never be
    able to speak at all in mock-mode local dev (Feature 20 cleanup)."""
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state (intro)

        ws.send_json({"type": "dev.simulate_transcript", "text": "I'd use a hash map."})
        ws.receive_json()  # transcript.partial
        ws.receive_json()  # transcript.final
        reply = ws.receive_json()
        assert reply["type"] == "interviewer.transcript"

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.is_candidate_speaking is False


async def test_maybe_speak_lock_prevents_concurrent_double_speak(monkeypatch):
    """Regression test for the race described in _maybe_speak's docstring:
    two near-simultaneous triggers on the same session (e.g. code.update
    racing a real STT provider's on_final callback) must not both pass
    can_speak's cooldown gate before either has written back. Exercised
    directly against `_maybe_speak` (bypassing the WS transport) since
    TestClient's synchronous style can't otherwise force two calls to
    genuinely interleave (Feature 20 cleanup)."""
    problem = ProblemInfo(**PROBLEM)
    record = ws_module.sessions.create(problem, "python", started_at=0.0)
    settings = get_settings()

    release = asyncio.Event()

    class SlowLLMProvider:
        def __init__(self) -> None:
            self.calls = 0

        async def propose_action(self, system_prompt: str, user_prompt: str) -> InterviewerAction:
            self.calls += 1
            await release.wait()
            return InterviewerAction(action="ask_question", message=f"Question {self.calls}?")

    provider = SlowLLMProvider()
    record.llm_provider = provider

    task_a = asyncio.create_task(ws_module._maybe_speak(record, settings, trigger="code_update"))
    task_b = asyncio.create_task(ws_module._maybe_speak(record, settings, trigger="code_update"))
    await asyncio.sleep(0)  # let task_a claim the lock and reach the LLM await
    release.set()
    await asyncio.gather(task_a, task_b)

    # Without the lock, both tasks would pass can_speak before either wrote
    # back, both would call the LLM, and both distinct messages would be
    # accepted (accept_proposal's fingerprint dedup only catches identical
    # text). With the lock, task_b's own can_speak check runs only after
    # task_a's full turn completes and is correctly rejected by cooldown.
    assert provider.calls == 1
    assert len(record.state.recent_interviewer_actions) == 1

    ws_module.sessions.remove(record.session_id)


def test_accepted_action_with_rubric_updates_emits_rubric_updated_event():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state (intro)

        record = ws_module.sessions.get(session_id)
        # jump directly into "complexity" for test setup (bypassing
        # transition legality, same pattern as test_interview_state.py) —
        # the mock LLM's canned complexity response carries rubric_updates.
        record.state.stage = "complexity"

        ws.send_json(
            {"type": "code.update", "language": "python", "code": "def f(): pass", "timestamp": 1.0}
        )
        question = ws.receive_json()
        assert question["type"] == "interviewer.transcript"

        # Feature 10 (ElevenLabs TTS) brackets every spoken text event with
        # interviewer.audio.start/.end — the mock TTS provider yields no
        # bytes in between, but the bracket events themselves still land on
        # the wire before the rubric update that follows the text event.
        audio_start = ws.receive_json()
        assert audio_start["type"] == "interviewer.audio.start"
        audio_end = ws.receive_json()
        assert audio_end["type"] == "interviewer.audio.end"

        rubric_event = ws.receive_json()
        assert rubric_event["type"] == "rubric.updated"
        assert rubric_event["evidence"]
        # the full current rubric dict is sent, not just the delta
        assert set(rubric_event["rubric"].keys()) == {
            "clarifying",
            "approach",
            "code_quality",
            "complexity",
            "communication",
            "testing",
        }
        assert rubric_event["rubric"]["complexity"] == 1

    assert record.state.rubric["complexity"] == 1


def test_session_end_produces_review_ready_with_valid_final_review():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state (intro)

        record = ws_module.sessions.get(session_id)
        # Seed transcript + hint activity directly onto state (same
        # test-fixture pattern as the `record.state.stage = ...` poke in
        # test_accepted_action_with_rubric_updates_emits_rubric_updated_event) —
        # replaying a full, cooldown-respecting real-time interview here
        # would take real wall-clock minutes (MIN_COOLDOWN_SECONDS); this
        # test only needs transcript/hint/rubric/stage evidence to actually
        # exist by the time session.end runs.
        record.state.transcript.append(
            TranscriptEntry(speaker="candidate", text="I'd use a hash map.", timestamp=1.0)
        )
        record.state.hint_level = 1
        record.state.recent_interviewer_actions.append("hint (level 1): Think about hash maps.")

        # Jump directly into "complexity" (bypassing transition legality,
        # same as the rubric test above) so the mock LLM's canned
        # complexity response — which carries rubric_updates — fires on
        # the very first interviewer speak of this session (no cooldown
        # has elapsed yet to block it).
        record.state.stage = "complexity"
        ws.send_json(
            {"type": "code.update", "language": "python", "code": "def f(): pass", "timestamp": 1.0}
        )
        ws.receive_json()  # interviewer.transcript
        ws.receive_json()  # interviewer.audio.start
        ws.receive_json()  # interviewer.audio.end
        rubric_event = ws.receive_json()
        assert rubric_event["type"] == "rubric.updated"

        ws.send_json({"type": "session.end"})
        stage_event = ws.receive_json()
        assert stage_event["type"] == "interviewer.state"
        assert stage_event["stage"] == "review"

        review_event = ws.receive_json()
        assert review_event["type"] == "review.ready"

    # FinalReview's own model_validator (schemas.py) re-checks every cited
    # evidence id resolves — round-tripping through it here is a schema
    # + evidence-grounding check, not just a "some dict came back" check.
    review = FinalReview.model_validate(review_event["review"])
    kinds = {item.kind for item in review.evidence}
    assert kinds == {"transcript", "hint", "rubric", "stage"}
    known_ids = {item.id for item in review.evidence}
    for point in (*review.strengths, *review.areas_to_improve):
        assert set(point.evidence_ids).issubset(known_ids)


def test_review_stage_never_speaks_again():
    with client.websocket_connect("/ws/interview") as ws:
        ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
        started = ws.receive_json()
        session_id = started["session_id"]
        ws.receive_json()  # interviewer.state (intro)

        ws.send_json({"type": "session.end"})
        stage_event = ws.receive_json()
        assert stage_event["stage"] == "review"
        ws.receive_json()  # review.ready

        ws.send_json(
            {"type": "code.update", "language": "python", "code": "def f(): pass", "timestamp": 1.0}
        )
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        next_message = ws.receive_json()
        assert next_message["code"] == "session_not_found"

    record = ws_module.sessions.get(session_id)
    assert record is not None
    assert record.state.recent_interviewer_actions == []
