-- Expected table shape for PostgresRepository (architecture.md §Q,
-- Feature 15). No migration framework is used, per CLAUDE.md's "keep the
-- architecture simple" — this file is applied by hand once against a
-- fresh Supabase/Postgres database:
--
--   psql "$DATABASE_URL" -f app/persistence/schema.sql
--
-- One table, deliberately not normalized: `events` is a JSONB array
-- holding every event that has ever flowed through a session (transcript
-- segments, code-update-triggered interviewer reactions, hints, rubric
-- updates, stage transitions — anything websocket/interview.py's `_emit`
-- has sent), in arrival order. `final_review` is stored separately
-- because it's the one artefact this feature's acceptance criteria calls
-- out on its own, and because it benefits from being directly readable
-- without scanning `events` for the last `review.ready` entry.

CREATE TABLE IF NOT EXISTS interview_sessions (
    id text PRIMARY KEY,
    problem jsonb NOT NULL,
    language text NOT NULL,
    started_at double precision NOT NULL,
    status text NOT NULL DEFAULT 'active',
    events jsonb NOT NULL DEFAULT '[]'::jsonb,
    final_review jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
