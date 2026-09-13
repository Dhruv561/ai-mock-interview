"""Session persistence interface (architecture.md §Q, Feature 15).

Mirrors the existing provider pattern (Protocol + mock/in-memory
implementation + real implementation + a `get_x(settings)` factory — see
providers/tts/{base,mock,elevenlabs}.py) rather than inventing a new shape
for this one subsystem.

The interface is deliberately small and shaped directly around what
websocket/interview.py already produces, not around a speculative "what
might a future admin UI query" design (CLAUDE.md principle 2 — keep the
architecture simple, avoid premature abstraction):

- `create_session` is called once, when a session starts.
- `append_event` is called from `_emit`, the single chokepoint every
  server -> client event (transcript, code-triggered rubric updates,
  hints, stage transitions, ...) already passes through. There is
  deliberately no separate `save_transcript_entry` / `save_code_snapshot`
  / `save_hint` method: every one of those already exists as one of the
  typed event dicts flowing through `_emit`, so a single generic
  "persist this event" method captures transcript, code snapshots (code
  updates ride along as part of the code-analysis-driven interviewer
  reaction), hints and rubric history for free, without call sites having
  to remember which of several methods to call for which event type.
- `save_final_review` is kept as its own method rather than folded into
  `append_event`, even though a review.ready event *also* flows through
  `_emit` and therefore already gets appended to the generic event log.
  The final review is the one artefact Feature 15's acceptance criteria
  calls out on its own ("final review persists") and the one a real
  implementation is most likely to want dedicated storage/columns for
  (PostgresRepository puts it in its own JSONB column and flips
  `status`/uses it to mark the session complete) rather than requiring
  every reader to linear-scan the generic event log for the last
  `review.ready` entry.
- `get_session` exists for future retrieval (e.g. a future "past sessions"
  endpoint) but is not wired into any HTTP/WS endpoint by this feature —
  Feature 15's acceptance criteria only requires that persistence
  *happens*, not that it's readable back via an API yet.

All methods are `async def` (not the async-generator style of
TTSProvider) — same reasoning as STTSession/STTProvider in
providers/stt/base.py: these are plain one-shot writes/reads, not a
streaming producer.
"""

from typing import Any, Protocol

from app.interview.schemas import FinalReview, ProblemInfo


class SessionRepository(Protocol):
    async def create_session(
        self, session_id: str, problem: ProblemInfo, language: str, started_at: float
    ) -> None: ...

    async def append_event(self, session_id: str, event: dict[str, Any]) -> None: ...

    async def save_final_review(self, session_id: str, review: FinalReview) -> None: ...

    async def get_session(self, session_id: str) -> dict[str, Any] | None: ...
