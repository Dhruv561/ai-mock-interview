"""Typed event contracts for the interview WebSocket protocol.

Mirrored by hand in shared/events.ts (Zod) — see shared/README.md for the
sync policy. This file is the source of truth; shared/events.ts must be
updated in the same commit whenever a shape here changes. See
architecture.md §G for the full protocol design (framing, reconnect,
event catalogue).

Only session.start/pause/resume/end, code.update, transcript.final,
hint.requested, screen.recording.*, dev.simulate_transcript (client events),
plus session.started and error (server events) are actually produced or
consumed today, by app/websocket/interview.py (Feature 06). The remaining
server event types (interviewer.*, transcript.partial, rubric.updated,
hint.response, review.ready) are defined here as typed contracts ahead of
the features that will emit them (07/08/10/11/13/14), per CLAUDE.md's "use
typed contracts" rule — nothing sends them yet.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter

Difficulty = Literal["Easy", "Medium", "Hard"]

InterviewStage = Literal[
    "intro",
    "clarification",
    "approach",
    "coding",
    "complexity",
    "testing",
    "optimisation",
    "review",
]

RubricCategory = Literal[
    "clarifying",
    "approach",
    "code_quality",
    "complexity",
    "communication",
    "testing",
]


class ProblemInfo(BaseModel):
    """Mirrors extension/src/content/leetcode.ts's ProblemInfo exactly,
    including the nullable fields — extraction is best-effort against
    LeetCode's live markup and can legitimately fail to find a number or
    difficulty while still returning a usable title/description."""

    slug: str
    number: str | None
    title: str
    difficulty: Difficulty | None
    description: str


class TimelineEvent(BaseModel):
    label: str
    elapsed_seconds: float


class FinalReview(BaseModel):
    overall_score: float
    rubric: dict[RubricCategory, int]
    strengths: list[str]
    areas_to_improve: list[str]
    timeline: list[TimelineEvent]


# --- Client -> server events ---


class SessionStartEvent(BaseModel):
    type: Literal["session.start"] = "session.start"
    problem: ProblemInfo
    language: str


class SessionPauseEvent(BaseModel):
    type: Literal["session.pause"] = "session.pause"


class SessionResumeEvent(BaseModel):
    type: Literal["session.resume"] = "session.resume"
    session_id: str
    last_seq: int


class SessionEndEvent(BaseModel):
    type: Literal["session.end"] = "session.end"


class TranscriptFinalEvent(BaseModel):
    type: Literal["transcript.final"] = "transcript.final"
    text: str
    timestamp: float


class CodeUpdateEvent(BaseModel):
    type: Literal["code.update"] = "code.update"
    language: str
    code: str
    timestamp: float


class ScreenRecordingStartedEvent(BaseModel):
    type: Literal["screen.recording.started"] = "screen.recording.started"


class ScreenRecordingStoppedEvent(BaseModel):
    type: Literal["screen.recording.stopped"] = "screen.recording.stopped"


class HintRequestedEvent(BaseModel):
    type: Literal["hint.requested"] = "hint.requested"


class DevSimulateTranscriptEvent(BaseModel):
    """Mock-mode only — rejected by the controller once that logic exists
    and USE_MOCK_PROVIDERS is false (architecture.md §G). The WS transport
    itself doesn't enforce that yet; there's no controller to enforce it in
    front of."""

    type: Literal["dev.simulate_transcript"] = "dev.simulate_transcript"
    text: str


ClientEvent = Annotated[
    SessionStartEvent
    | SessionPauseEvent
    | SessionResumeEvent
    | SessionEndEvent
    | TranscriptFinalEvent
    | CodeUpdateEvent
    | ScreenRecordingStartedEvent
    | ScreenRecordingStoppedEvent
    | HintRequestedEvent
    | DevSimulateTranscriptEvent,
    Field(discriminator="type"),
]

CLIENT_EVENT_ADAPTER: TypeAdapter[ClientEvent] = TypeAdapter(ClientEvent)


# --- Server -> client events ---


class BaseServerEvent(BaseModel):
    seq: int


class SessionStartedEvent(BaseServerEvent):
    type: Literal["session.started"] = "session.started"
    session_id: str


class InterviewerStateEvent(BaseServerEvent):
    type: Literal["interviewer.state"] = "interviewer.state"
    stage: InterviewStage


class InterviewerTranscriptEvent(BaseServerEvent):
    type: Literal["interviewer.transcript"] = "interviewer.transcript"
    text: str


class InterviewerAudioStartEvent(BaseServerEvent):
    type: Literal["interviewer.audio.start"] = "interviewer.audio.start"
    format: str


class InterviewerAudioEndEvent(BaseServerEvent):
    type: Literal["interviewer.audio.end"] = "interviewer.audio.end"


class TranscriptPartialEvent(BaseServerEvent):
    type: Literal["transcript.partial"] = "transcript.partial"
    text: str


class RubricUpdatedEvent(BaseServerEvent):
    type: Literal["rubric.updated"] = "rubric.updated"
    rubric: dict[RubricCategory, int]
    evidence: str


class HintResponseEvent(BaseServerEvent):
    type: Literal["hint.response"] = "hint.response"
    level: int
    text: str


class ReviewReadyEvent(BaseServerEvent):
    type: Literal["review.ready"] = "review.ready"
    review: FinalReview


class ErrorEvent(BaseServerEvent):
    type: Literal["error"] = "error"
    code: str
    message: str
    recoverable: bool


ServerEvent = Annotated[
    SessionStartedEvent
    | InterviewerStateEvent
    | InterviewerTranscriptEvent
    | InterviewerAudioStartEvent
    | InterviewerAudioEndEvent
    | TranscriptPartialEvent
    | RubricUpdatedEvent
    | HintResponseEvent
    | ReviewReadyEvent
    | ErrorEvent,
    Field(discriminator="type"),
]

SERVER_EVENT_ADAPTER: TypeAdapter[ServerEvent] = TypeAdapter(ServerEvent)
