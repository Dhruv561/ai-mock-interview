"""WebSocket session transport (Feature 06 — architecture.md §G).

Owns connection lifecycle, event validation, and the resume/replay
protocol. Deliberately has no interview-domain logic: it does not run the
state machine, call the LLM, or compute the rubric — those are Features
07/08/13, layered on top of this transport later. Client events other than
session.start/resume are validated and timestamped but otherwise inert
until that logic exists.
"""

from __future__ import annotations

import json
import time
import uuid
from collections import deque
from dataclasses import dataclass, field

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.interview.schemas import (
    CLIENT_EVENT_ADAPTER,
    ErrorEvent,
    ProblemInfo,
    SessionResumeEvent,
    SessionStartedEvent,
    SessionStartEvent,
)

router = APIRouter()

# Sessions survive a single disconnect so a reconnecting client can resume
# (architecture.md §G) — kept in-memory only, single-process, acceptable
# for a hackathon deployment (documented limitation, §Q).
SESSION_GRACE_SECONDS = 5 * 60
RING_BUFFER_SIZE = 200


@dataclass
class SessionRecord:
    session_id: str
    problem: ProblemInfo
    language: str
    seq: int = 0
    events: deque[dict] = field(default_factory=lambda: deque(maxlen=RING_BUFFER_SIZE))
    last_seen: float = field(default_factory=time.monotonic)

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
        record = SessionRecord(session_id=session_id, problem=problem, language=language)
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


async def _emit(ws: WebSocket, record: SessionRecord, event: dict) -> None:
    stamped = {**event, "seq": record.next_seq()}
    record.events.append(stamped)
    record.last_seen = time.monotonic()
    await ws.send_json(stamped)


async def _send_error(ws: WebSocket, seq: int, code: str, message: str, recoverable: bool) -> None:
    event = ErrorEvent(seq=seq, code=code, message=message, recoverable=recoverable)
    await ws.send_json(event.model_dump())


@router.websocket("/ws/interview")
async def interview_socket(ws: WebSocket) -> None:
    await ws.accept()
    record: SessionRecord | None = None

    try:
        while True:
            raw = await ws.receive_text()

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
                started = SessionStartedEvent(seq=0, session_id=record.session_id)
                await _emit(ws, record, started.model_dump())
                continue

            if isinstance(client_event, SessionResumeEvent):
                found = sessions.get(client_event.session_id)
                if found is None:
                    message = "Session expired or does not exist."
                    await _send_error(ws, 0, "session_not_found", message, False)
                    continue
                record = found
                record.last_seen = time.monotonic()
                for buffered in record.events:
                    if buffered["seq"] > client_event.last_seq:
                        await ws.send_json(buffered)
                continue

            if record is None:
                message = "Send session.start or session.resume first."
                await _send_error(ws, 0, "no_active_session", message, True)
                continue

            # code.update, transcript.final, hint.requested,
            # screen.recording.*, session.pause/end, dev.simulate_transcript:
            # accepted and keep the session alive, but no interview-domain
            # logic exists yet to act on them (Features 07/08/13/14).
            record.last_seen = time.monotonic()

    except WebSocketDisconnect:
        return
