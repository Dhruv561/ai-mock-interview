"""In-memory session repository — the default (USE_MOCK_PROVIDERS=true, or
no DATABASE_URL configured), matching every other provider's mock-first
default in this codebase (architecture.md §Q / §S; CLAUDE.md "the
application should still be useful in local development when an external
provider is unavailable").

Backing store is a module-level dict shared by every `InMemoryRepository`
instance, not a fresh dict per instance. This matters because
websocket/interview.py resolves one repository per *session* (via
`get_repository(settings)`, called once at session.start and stored on the
SessionRecord — mirroring how one STTSession is opened per session rather
than per event), the same way `get_llm_provider`/`get_tts_provider` are
called fresh each time they're needed. If `InMemoryRepository.__init__`
owned a private `dict`, every session would get its own isolated,
single-session store, and `get_session` would be unable to see any session
other than the one that created that particular instance — defeating the
point of a shared repository. Sharing one module-level dict keeps the
factory's "construct a cheap instance whenever you need one" shape
(consistent with the other providers) while still accumulating every
session into one place, same as `SessionRegistry` in
websocket/interview.py is itself a module-level singleton for the same
reason.
"""

from typing import Any

from app.interview.schemas import FinalReview, ProblemInfo

_STORE: dict[str, dict[str, Any]] = {}


class InMemoryRepository:
    def __init__(self) -> None:
        self._sessions = _STORE

    async def create_session(
        self, session_id: str, problem: ProblemInfo, language: str, started_at: float
    ) -> None:
        self._sessions[session_id] = {
            "session_id": session_id,
            "problem": problem.model_dump(),
            "language": language,
            "started_at": started_at,
            "status": "active",
            "events": [],
            "final_review": None,
        }

    async def append_event(self, session_id: str, event: dict[str, Any]) -> None:
        session = self._sessions.get(session_id)
        if session is None:
            # Defensive, not expected in practice: every real call site
            # creates the session before ever emitting an event for it.
            # Persistence writes are fire-and-forget (websocket/
            # interview.py's `_persist`), so this must never raise.
            return
        session["events"].append(event)

    async def save_final_review(self, session_id: str, review: FinalReview) -> None:
        session = self._sessions.get(session_id)
        if session is None:
            return
        session["final_review"] = review.model_dump(mode="json")
        session["status"] = "completed"

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        session = self._sessions.get(session_id)
        if session is None:
            return None
        # Shallow-copy the events list so a caller mutating the returned
        # dict can't corrupt this repository's own buffer.
        return {**session, "events": list(session["events"])}
