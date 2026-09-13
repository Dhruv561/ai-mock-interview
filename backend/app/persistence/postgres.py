"""Postgres-backed session repository (architecture.md §Q, Feature 15) —
backs persistence with Supabase-hosted Postgres (or any Postgres reachable
via `DATABASE_URL`) in a real deployment.

Not exercised against a real Postgres/Supabase database this session — no
`DATABASE_URL` is configured in this environment. This is the same class
of live-verification gap already documented for the Deepgram STT provider
(Feature 05), the Anthropic LLM provider (Feature 08) and the ElevenLabs
TTS provider (Feature 10): implemented carefully against the driver's
documented API, unverified against a live connection. See this feature's
FEATURE_PROGRESS.md entry for the exact next action.

Uses `asyncpg` directly rather than an ORM or SQLAlchemy's async layer.
Architecture.md §Q already called this: "no ORM ceremony beyond what's
needed to read/write JSONB blobs" — the access pattern is a handful of
parameterized INSERT/UPDATE/SELECT statements against one table (see
`schema.sql`), which doesn't earn a query-builder or migration framework
in a hackathon-scoped MVP. `asyncpg` is also already the natural choice
for a FastAPI/asyncio backend: it's the fastest pure-async Postgres driver
and needs no sync-to-async adapter layer.

One `PostgresRepository` is constructed per interview session
(websocket/interview.py resolves it once via `get_repository(settings)`
at session.start and stores it on the SessionRecord — the same lifecycle
as one `STTSession` per session, not one per event), but every instance
shares one module-level connection pool (Feature 20 cleanup), the same
pattern `InMemoryRepository` already uses for its module-level `_STORE`:
without this, N concurrent sessions would each lazily open their own
`min_size=1, max_size=4` pool and never close it (nothing in
websocket/interview.py closed a per-session pool on disconnect/expiry),
so connections against the real database grew unboundedly with session
count instead of staying bounded by one pool's `max_size`. The pool is
still opened lazily on first use rather than eagerly in `__init__`, so
constructing a repository never blocks or fails just because a database
happens to be briefly unreachable at session-start time — the first
actual write is what would surface a connection failure, and every call
site in websocket/interview.py already wraps persistence calls in a
logged-and-swallowed fire-and-forget task, so a failed connect degrades
the same way a failed write would (the interview continues, nothing is
persisted for that session). A pool (not a single Connection) is used
because asyncpg Connections aren't safe for concurrent queries and
writes across different sessions are fired concurrently (websocket/
interview.py never awaits a persistence write before continuing) — a
small shared pool (`min_size=1, max_size=4`) absorbs that without
serializing on a lock.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import asyncpg

from app.interview.schemas import FinalReview, ProblemInfo

# Module-level, shared by every PostgresRepository instance regardless of
# which session constructed it — see the module docstring above. Guarded
# by `_pool_lock` (double-checked locking) so two sessions racing to
# resolve the pool for the first time can't each start their own
# `asyncpg.create_pool` call.
_pool: asyncpg.Pool | None = None
_pool_lock = asyncio.Lock()


async def _get_shared_pool(database_url: str) -> asyncpg.Pool:
    global _pool
    if _pool is None:
        async with _pool_lock:
            if _pool is None:  # re-check: another task may have won the race
                _pool = await asyncpg.create_pool(database_url, min_size=1, max_size=4)
    return _pool

_CREATE_SESSION_SQL = """
INSERT INTO interview_sessions (id, problem, language, started_at, status, events, final_review)
VALUES ($1, $2::jsonb, $3, $4, 'active', '[]'::jsonb, NULL)
ON CONFLICT (id) DO NOTHING
"""

_APPEND_EVENT_SQL = """
UPDATE interview_sessions
SET events = events || $2::jsonb
WHERE id = $1
"""

_SAVE_FINAL_REVIEW_SQL = """
UPDATE interview_sessions
SET final_review = $2::jsonb, status = 'completed'
WHERE id = $1
"""

_GET_SESSION_SQL = """
SELECT id, problem, language, started_at, status, events, final_review
FROM interview_sessions
WHERE id = $1
"""


class PostgresRepository:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    async def _get_pool(self) -> asyncpg.Pool:
        return await _get_shared_pool(self._database_url)

    async def create_session(
        self, session_id: str, problem: ProblemInfo, language: str, started_at: float
    ) -> None:
        pool = await self._get_pool()
        await pool.execute(
            _CREATE_SESSION_SQL,
            session_id,
            json.dumps(problem.model_dump()),
            language,
            started_at,
        )

    async def append_event(self, session_id: str, event: dict[str, Any]) -> None:
        pool = await self._get_pool()
        # Wrap the single event in a JSON array so `events || $2::jsonb`
        # appends one array element rather than merging two jsonb objects.
        await pool.execute(_APPEND_EVENT_SQL, session_id, json.dumps([event]))

    async def save_final_review(self, session_id: str, review: FinalReview) -> None:
        pool = await self._get_pool()
        await pool.execute(
            _SAVE_FINAL_REVIEW_SQL, session_id, json.dumps(review.model_dump(mode="json"))
        )

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        pool = await self._get_pool()
        row = await pool.fetchrow(_GET_SESSION_SQL, session_id)
        if row is None:
            return None
        return {
            "session_id": row["id"],
            "problem": json.loads(row["problem"]),
            "language": row["language"],
            "started_at": row["started_at"],
            "status": row["status"],
            "events": json.loads(row["events"]),
            "final_review": json.loads(row["final_review"]) if row["final_review"] else None,
        }
