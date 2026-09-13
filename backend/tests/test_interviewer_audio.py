"""Integration tests for Feature 10 (ElevenLabs TTS, architecture.md §M):
every text event an interviewer action produces (interviewer.transcript
from ask_question/transition_stage, hint.response from give_hint) is
bracketed by interviewer.audio.start / interviewer.audio.end, with raw PCM
binary frames in between when the provider actually produces audio.

Mirrors test_websocket_interview.py's TestClient-based style. The default
test settings run with USE_MOCK_PROVIDERS=true, so these exercise the real
_speak_audio wiring end-to-end against MockTTSProvider (which yields no
audio) unless a test monkeypatches app.websocket.interview.get_tts_provider
to something that does.
"""

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


def _start_session(ws) -> str:
    ws.send_json({"type": "session.start", "problem": PROBLEM, "language": "python"})
    started = ws.receive_json()
    ws.receive_json()  # interviewer.state (intro)
    return started["session_id"]


def test_code_update_reply_is_bracketed_by_audio_start_and_end_with_mock_tts():
    with client.websocket_connect("/ws/interview") as ws:
        _start_session(ws)
        ws.send_json(
            {"type": "code.update", "language": "python", "code": "def f(): pass", "timestamp": 1.0}
        )

        reply = ws.receive_json()
        assert reply["type"] == "interviewer.transcript"

        audio_start = ws.receive_json()
        assert audio_start["type"] == "interviewer.audio.start"
        assert audio_start["format"] == "pcm_s16le_16000"

        # mock TTS yields no bytes, so the very next frame is audio.end,
        # not a binary chunk
        audio_end = ws.receive_json()
        assert audio_end["type"] == "interviewer.audio.end"


def test_hint_response_is_bracketed_by_audio_start_and_end_with_mock_tts():
    with client.websocket_connect("/ws/interview") as ws:
        _start_session(ws)
        ws.send_json({"type": "hint.requested"})

        reply = ws.receive_json()
        assert reply["type"] == "hint.response"

        audio_start = ws.receive_json()
        assert audio_start["type"] == "interviewer.audio.start"

        audio_end = ws.receive_json()
        assert audio_end["type"] == "interviewer.audio.end"


def test_tts_success_streams_binary_audio_frames_between_start_and_end(monkeypatch):
    class FakeTTSProvider:
        async def synthesize(self, text: str):
            yield b"chunk-1"
            yield b"chunk-2"

    monkeypatch.setattr(ws_module, "get_tts_provider", lambda settings: FakeTTSProvider())

    with client.websocket_connect("/ws/interview") as ws:
        _start_session(ws)
        ws.send_json(
            {"type": "code.update", "language": "python", "code": "def f(): pass", "timestamp": 1.0}
        )

        reply = ws.receive_json()
        assert reply["type"] == "interviewer.transcript"

        audio_start = ws.receive_json()
        assert audio_start["type"] == "interviewer.audio.start"

        assert ws.receive_bytes() == b"chunk-1"
        assert ws.receive_bytes() == b"chunk-2"

        audio_end = ws.receive_json()
        assert audio_end["type"] == "interviewer.audio.end"


def test_tts_failure_does_not_block_interviewer_text_and_still_closes_audio_stream(monkeypatch):
    class FailingTTSProvider:
        async def synthesize(self, text: str):
            raise RuntimeError("provider unreachable")
            yield b""  # pragma: no cover - never reached; makes this an async generator

    monkeypatch.setattr(ws_module, "get_tts_provider", lambda settings: FailingTTSProvider())

    with client.websocket_connect("/ws/interview") as ws:
        _start_session(ws)
        ws.send_json(
            {"type": "code.update", "language": "python", "code": "def f(): pass", "timestamp": 1.0}
        )

        # the text event is unaffected by the TTS failure
        reply = ws.receive_json()
        assert reply["type"] == "interviewer.transcript"
        assert reply["text"]

        audio_start = ws.receive_json()
        assert audio_start["type"] == "interviewer.audio.start"

        # audio.end still arrives so the client's player never hangs open
        # waiting for audio that will never come
        audio_end = ws.receive_json()
        assert audio_end["type"] == "interviewer.audio.end"

        # the session itself is unaffected — still usable afterward
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        error = ws.receive_json()
        assert error["code"] == "session_not_found"


def test_tts_failure_before_start_event_emits_no_audio_events(monkeypatch):
    """If the provider factory itself blows up (e.g. a bad client
    construction) before interviewer.audio.start is ever emitted, no audio
    events are sent at all — there is nothing to close."""

    def _boom(settings):
        raise RuntimeError("provider construction failed")

    monkeypatch.setattr(ws_module, "get_tts_provider", _boom)

    with client.websocket_connect("/ws/interview") as ws:
        _start_session(ws)
        ws.send_json(
            {"type": "code.update", "language": "python", "code": "def f(): pass", "timestamp": 1.0}
        )

        reply = ws.receive_json()
        assert reply["type"] == "interviewer.transcript"

        # no audio.start/end at all — go straight to proving the socket is
        # still alive and the next thing on the wire is unrelated
        ws.send_json({"type": "session.resume", "session_id": "does-not-exist", "last_seq": 0})
        error = ws.receive_json()
        assert error["code"] == "session_not_found"
