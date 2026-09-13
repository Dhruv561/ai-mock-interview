"""Typed event contracts for the interview WebSocket protocol.

Mirrored by hand in shared/events.ts (Zod) — see shared/README.md for the
sync policy. This file is the source of truth; shared/events.ts must be
updated in the same commit whenever a shape here changes. See
architecture.md §G for the full protocol design (framing, reconnect,
event catalogue).

Only session.start/pause/resume/end, code.update, hint.requested,
screen.recording.*, dev.simulate_transcript (client events), plus
session.started, transcript.partial, transcript.final and error (server
events) are actually produced or consumed today, by
app/websocket/interview.py (Feature 06) and the STT pipeline
(app/providers/stt/*, Feature 05). The remaining server event types
(interviewer.*, rubric.updated, hint.response, review.ready) are defined
here as typed contracts ahead of the features that will emit them
(07/08/11/13/14), per CLAUDE.md's "use typed contracts" rule — nothing
sends them yet.

Deliberate PRD deviation (documented per CLAUDE.md's "do not silently
change requirements" rule): PRD.md §9 lists transcript.partial/transcript.final
under "Client -> backend events" and omits them from the server list
entirely. That doesn't match this project's own already-committed
architecture (architecture.md §E/§H): the client streams raw mic audio to
the backend, and the backend's STT provider is what produces partial/final
transcript segments — the client has no way to originate them itself. Both
events are server -> client here, matching §H's component spec (which
already described them that way) rather than §G's original catalogue
listing (which copied the PRD's placement without checking it against §H).
See architecture.md §G for the full note.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter, model_validator

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


EvidenceKind = Literal["transcript", "code_analysis", "hint", "rubric", "stage"]


class EvidenceItem(BaseModel):
    """One traceable fact from the interview record (Feature 14 /
    architecture.md §P) — the only material the evaluator prompt is allowed
    to draw on. `id` is what a ReviewPoint.evidence_ids entry points at;
    `text` is a short, human-readable rendering of the underlying record
    (a quoted transcript line, a hint's text, a code-analysis observation,
    a rubric change with its own evidence string, or a stage transition) —
    not a database row, so the evaluator and the post-hoc verification pass
    both work off plain strings, no separate lookup needed."""

    id: str
    kind: EvidenceKind
    text: str


class ReviewPoint(BaseModel):
    """One strength or area-to-improve bullet. `evidence_ids` must be
    non-empty and every id must exist in the enclosing FinalReview.evidence
    list — CLAUDE.md §10 ("evidence-based final feedback") and
    architecture.md §P forbid a generic claim with no traceable cause, and
    this is what makes that schema-checkable rather than just prompted-for."""

    text: str
    evidence_ids: list[str] = Field(min_length=1)


class FinalReview(BaseModel):
    overall_score: float
    rubric: dict[RubricCategory, int]
    strengths: list[ReviewPoint]
    areas_to_improve: list[ReviewPoint]
    timeline: list[TimelineEvent]
    evidence: list[EvidenceItem]

    @model_validator(mode="after")
    def _evidence_ids_must_resolve(self) -> "FinalReview":
        """Schema-level half of architecture.md §P's "lightly verify every
        cited evidence id actually exists" check — this catches a
        dangling/invented id at construction time; evaluator.py still owns
        the reject-and-retry-once behaviour, since a validator can only
        raise, not re-ask the LLM."""
        known_ids = {item.id for item in self.evidence}
        for point in (*self.strengths, *self.areas_to_improve):
            unknown = [eid for eid in point.evidence_ids if eid not in known_ids]
            if unknown:
                raise ValueError(
                    f"ReviewPoint {point.text!r} cites unknown evidence id(s): {unknown}"
                )
        return self


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


class TranscriptFinalEvent(BaseServerEvent):
    type: Literal["transcript.final"] = "transcript.final"
    text: str
    timestamp: float


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
    | TranscriptFinalEvent
    | RubricUpdatedEvent
    | HintResponseEvent
    | ReviewReadyEvent
    | ErrorEvent,
    Field(discriminator="type"),
]

SERVER_EVENT_ADAPTER: TypeAdapter[ServerEvent] = TypeAdapter(ServerEvent)
