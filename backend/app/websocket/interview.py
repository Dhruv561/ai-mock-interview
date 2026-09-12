"""WebSocket session transport (Feature 06 — architecture.md §G), the STT
audio relay (Feature 05 — architecture.md §E/§H), the interview state
machine wiring (Feature 07 — architecture.md §I), and the AI interviewer
+ controller (Feature 08 — architecture.md §J/§L).

Owns connection lifecycle, event validation, the resume/replay protocol,
forwarding binary mic-audio frames to a per-session STT provider, keeping
each session's InterviewState up to date as events arrive, and — via
_maybe_speak — asking the interviewer agent for a proposed action and
having the controller decide whether to actually execute it.
screen.recording.*/session.pause are validated and keep the session alive
but don't yet drive any behaviour (Features 08's controller only reacts to
code/transcript/hint events right now; recording state is Feature 12).
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections import deque
from dataclasses import dataclass, field

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from starlette.websockets import WebSocketState

from app.agents.interviewer import propose_interviewer_action
from app.config import Settings, get_settings
from app.interview.controller import InterviewController
from app.interview.prompts import Trigger
from app.interview.schemas import (
    CLIENT_EVENT_ADAPTER,
    CodeUpdateEvent,
    DevSimulateTranscriptEvent,
    ErrorEvent,
    HintRequestedEvent,
    HintResponseEvent,
    InterviewerStateEvent,
    InterviewerTranscriptEvent,
    ProblemInfo,
    SessionEndEvent,
    SessionResumeEvent,
    SessionStartedEvent,
    SessionStartEvent,
    TranscriptFinalEvent,
    TranscriptPartialEvent,
)
from app.interview.state import InterviewState, TranscriptEntry
from app.providers.llm import get_llm_provider
from app.providers.stt import get_stt_provider
from app.providers.stt.base import STTSession

logger = logging.getLogger(__name__)

router = APIRouter()

# Sessions survive a single disconnect so a reconnecting client can resume
# (architecture.md §G) — kept in-memory only, single-process, acceptable
# for a hackathon deployment (documented limitation, §Q).
SESSION_GRACE_SECONDS = 5 * 60
RING_BUFFER_SIZE = 200


@dataclass
class SessionRecord:
    session_id: str
    state: InterviewState
    controller: InterviewController
    seq: int = 0
    events: deque[dict] = field(default_factory=lambda: deque(maxlen=RING_BUFFER_SIZE))
    last_seen: float = field(default_factory=time.monotonic)
    # The connection currently allowed to receive live sends for this
    # session — reassigned on session.start and on every session.resume, so
    # server-initiated events (e.g. STT callbacks firing later, off a
    # background task) reach whichever connection is actually live rather
    # than a stale one captured by closure at session-start time.
    active_ws: WebSocket | None = None
    stt_session: STTSession | None = None

    def next_seq(self) -> int:
        self.seq += 1
        return self.seq


class SessionRegistry:
    """Module-level singleton so a session outlives the connection object
    it was created on — a fresh WebSocket from a reconnecting client looks
    it up by id, not by which socket created it."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionRecord] = {}

    def create(self, problem: ProblemInfo, language: str) -> SessionRecord:
        session_id = str(uuid.uuid4())
        state = InterviewState(problem=problem, language=language)
        controller = InterviewController(state)
        record = SessionRecord(session_id=session_id, state=state, controller=controller)
        self._sessions[session_id] = record
        return record

    def get(self, session_id: str) -> SessionRecord | None:
        record = self._sessions.get(session_id)
        if record is None:
            return None
        if time.monotonic() - record.last_seen > SESSION_GRACE_SECONDS:
            del self._sessions[session_id]
            return None
        return record


sessions = SessionRegistry()


async def _emit(record: SessionRecord, event: dict) -> None:
    """Stamps + buffers an event for a session, and sends it live if a
    connection is currently attached. Buffering happens unconditionally so
    a reconnecting client can still replay it even if nothing was attached
    to receive it live (e.g. an STT result that arrives mid-reconnect)."""
    stamped = {**event, "seq": record.next_seq()}
    record.events.append(stamped)
    record.last_seen = time.monotonic()

    ws = record.active_ws
    if ws is not None and ws.client_state == WebSocketState.CONNECTED:
        try:
            await ws.send_json(stamped)
        except RuntimeError:
            pass  # connection dropped between the state check and the send


async def _send_error(ws: WebSocket, seq: int, code: str, message: str, recoverable: bool) -> None:
    event = ErrorEvent(seq=seq, code=code, message=message, recoverable=recoverable)
    await ws.send_json(event.model_dump())


async def _maybe_speak(
    record: SessionRecord,
    settings: Settings,
    *,
    trigger: Trigger = "code_update",
    hint_requested: bool = False,
) -> None:
    """Asks the interviewer agent for a proposal and, if the controller
    accepts it, emits whatever event that proposal implies. Silence
    (remain_silent, or any rejected proposal) emits nothing at all — that
    is the intended behaviour (CLAUDE.md: "the interviewer should not
    speak on every event"), not a missing code path."""
    now = time.time()
    if not record.controller.can_speak(now=now, hint_requested=hint_requested):
        return

    provider = get_llm_provider(settings)
    proposal = await propose_interviewer_action(record.state, provider, trigger=trigger)
    accepted = record.controller.accept_proposal(proposal, now=now)
    if accepted is None:
        return

    if accepted.action == "ask_question" and accepted.message:
        record.state.recent_interviewer_actions.append(f"asked: {accepted.message}")
        entry = TranscriptEntry(speaker="interviewer", text=accepted.message, timestamp=now)
        record.state.transcript.append(entry)
        event = InterviewerTranscriptEvent(seq=0, text=accepted.message)
        await _emit(record, event.model_dump())

    elif accepted.action == "give_hint" and accepted.message:
        level = record.state.hint_level
        record.state.recent_interviewer_actions.append(f"hint (level {level}): {accepted.message}")
        event = HintResponseEvent(seq=0, level=level, text=accepted.message)
        await _emit(record, event.model_dump())

    elif accepted.action == "transition_stage":
        stage_event = InterviewerStateEvent(seq=0, stage=record.state.stage)
        await _emit(record, stage_event.model_dump())
        if accepted.message:
            entry = TranscriptEntry(speaker="interviewer", text=accepted.message, timestamp=now)
            record.state.transcript.append(entry)
            transcript_event = InterviewerTranscriptEvent(seq=0, text=accepted.message)
            await _emit(record, transcript_event.model_dump())


def _make_transcript_callbacks(session_id: str, settings: Settings):
    """STT provider callbacks close over a session_id, not a SessionRecord
    or WebSocket, so they keep working correctly even if the session has
    since been resumed on a different connection (or none at all)."""

    async def on_partial(text: str) -> None:
        record = sessions.get(session_id)
        if record is None:
            return
        event = TranscriptPartialEvent(seq=0, text=text)
        await _emit(record, event.model_dump())

    async def on_final(text: str) -> None:
        record = sessions.get(session_id)
        if record is None:
            return
        timestamp = time.time()
        entry = TranscriptEntry(speaker="candidate", text=text, timestamp=timestamp)
        record.state.transcript.append(entry)
        event = TranscriptFinalEvent(seq=0, text=text, timestamp=timestamp)
        await _emit(record, event.model_dump())
        await _maybe_speak(record, settings, trigger="transcript_final")

    return on_partial, on_final


@router.websocket("/ws/interview")
async def interview_socket(ws: WebSocket) -> None:
    await ws.accept()
    record: SessionRecord | None = None
    settings = get_settings()

    try:
        while True:
            message = await ws.receive()

            if message["type"] == "websocket.disconnect":
                return

            if message.get("bytes") is not None:
                if record is None:
                    await _send_error(ws, 0, "no_active_session", "Send session.start first.", True)
                    continue
                if record.stt_session is not None:
                    try:
                        await record.stt_session.send_audio(message["bytes"])
                    except Exception:
                        # A dead STT upstream must never kill the interview
                        # (architecture.md §H). Before this guard existed, a
                        # Deepgram close raised straight out of the ASGI
                        # handler, dropped the client's WebSocket, and the
                        # client's own reconnect/resume re-entered the same
                        # failure — an infinite crash-reconnect loop observed
                        # live on 2026-09-13.
                        logger.exception("STT send failed; continuing without transcription")
                        try:
                            await record.stt_session.close()
                        except Exception:
                            pass
                        record.stt_session = None
                        await _send_error(
                            ws,
                            0,
                            "stt_unavailable",
                            "Transcription stopped; the interview continues without it.",
                            True,
                        )
                record.last_seen = time.monotonic()
                continue

            raw = message.get("text")
            if raw is None:
                continue

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await _send_error(ws, 0, "invalid_json", "Message was not valid JSON.", True)
                continue

            try:
                client_event = CLIENT_EVENT_ADAPTER.validate_python(data)
            except ValidationError as exc:
                first_error = exc.errors()[0]
                loc = ".".join(str(part) for part in first_error["loc"])
                await _send_error(
                    ws,
                    0,
                    "invalid_event",
                    f"Event failed validation at '{loc}': {first_error['msg']}",
                    True,
                )
                continue

            if isinstance(client_event, SessionStartEvent):
                record = sessions.create(client_event.problem, client_event.language)
                record.active_ws = ws
                on_partial, on_final = _make_transcript_callbacks(record.session_id, settings)
                try:
                    record.stt_session = await get_stt_provider(settings).start_session(
                        on_partial, on_final
                    )
                except Exception:
                    # STT connection failure must degrade gracefully, not
                    # kill the interview session (architecture.md §H risk).
                    record.stt_session = None
                started = SessionStartedEvent(seq=0, session_id=record.session_id)
                await _emit(record, started.model_dump())
                stage_event = InterviewerStateEvent(seq=0, stage=record.state.stage)
                await _emit(record, stage_event.model_dump())
                continue

            if isinstance(client_event, SessionResumeEvent):
                found = sessions.get(client_event.session_id)
                if found is None:
                    message_text = "Session expired or does not exist."
                    await _send_error(ws, 0, "session_not_found", message_text, False)
                    continue
                record = found
                record.active_ws = ws
                record.last_seen = time.monotonic()
                for buffered in record.events:
                    if buffered["seq"] > client_event.last_seq:
                        await ws.send_json(buffered)
                continue

            if record is None:
                message_text = "Send session.start or session.resume first."
                await _send_error(ws, 0, "no_active_session", message_text, True)
                continue

            if isinstance(client_event, DevSimulateTranscriptEvent):
                if not settings.use_mock_providers:
                    message_text = "dev.simulate_transcript is mock-mode only."
                    await _send_error(ws, 0, "mock_only", message_text, True)
                    continue
                partial = TranscriptPartialEvent(seq=0, text=client_event.text)
                await _emit(record, partial.model_dump())
                timestamp = time.time()
                text = client_event.text
                record.state.transcript.append(
                    TranscriptEntry(speaker="candidate", text=text, timestamp=timestamp)
                )
                final = TranscriptFinalEvent(seq=0, text=client_event.text, timestamp=timestamp)
                await _emit(record, final.model_dump())
                await _maybe_speak(record, settings, trigger="transcript_final")
                continue

            if isinstance(client_event, CodeUpdateEvent):
                record.state.current_code = client_event.code
                record.state.language = client_event.language
                record.last_seen = time.monotonic()
                await _maybe_speak(record, settings, trigger="code_update")
                continue

            if isinstance(client_event, HintRequestedEvent):
                # hint_level itself is incremented inside accept_proposal
                # (interview/controller.py) only once a give_hint action is
                # actually accepted — that's the single source of truth for
                # the level-3 cap (architecture.md §L rule 6), whether the
                # hint was explicitly requested (here) or proposed by the
                # LLM on its own initiative from another trigger.
                await _maybe_speak(record, settings, trigger="hint_requested", hint_requested=True)
                record.last_seen = time.monotonic()
                continue

            if isinstance(client_event, SessionEndEvent):
                if record.stt_session is not None:
                    await record.stt_session.close()
                    record.stt_session = None
                if record.state.stage != "review":
                    record.state.transition_to("review")
                    stage_event = InterviewerStateEvent(seq=0, stage=record.state.stage)
                    await _emit(record, stage_event.model_dump())
                record.last_seen = time.monotonic()
                continue

            # screen.recording.*, session.pause: accepted and keep the
            # session alive, but no interview-domain logic exists yet to
            # act on them (Features 08/12).
            record.last_seen = time.monotonic()

    except WebSocketDisconnect:
        return
