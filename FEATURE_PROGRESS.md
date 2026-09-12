# FEATURE_PROGRESS.md

This file is the authoritative checkpoint system for feature-level work.

The goal is to ensure the project can safely stop at any point, including when coding credits/context are exhausted, without losing the exact state of a feature.

## Status lifecycle

Every feature follows:

`PLANNED → IN_PROGRESS → IMPLEMENTED → VERIFIED → DONE`

Use `PAUSED` when work stops before completion.

Do not mark a feature `DONE` until implementation, verification and acceptance criteria are complete.

## How Claude must use this file

Before working on a feature:
- find its feature record
- change status to `IN_PROGRESS`
- update `started_at`
- update `current_task`
- confirm the next action

After every meaningful implementation slice:
- update `completed`
- update `remaining`
- update `files_changed`
- update `tests_run`
- update `verification`
- update `next_action`

When stopping:
- set `PAUSED` unless complete
- write enough detail that a fresh Claude Code session can continue without guessing

## Stop/checkpoint requirement

If any of the following happens:
- user asks to stop
- credits are running low
- context is becoming unreliable
- a major blocker prevents safe progress

Claude must immediately use the STOP PROTOCOL from `CLAUDE.md`.

The final checkpoint must state the exact next action.

---

# Feature 01 — Repository and project foundation

## Status
PLANNED

## Priority
P0

## Current task
Create the repository structure, tooling, environment configuration and basic development scripts.

## Acceptance criteria
- [ ] repository structure created
- [ ] extension project boots
- [ ] backend project boots
- [ ] shared types/schemas strategy established
- [ ] `.env.example` exists
- [ ] README has local setup
- [ ] lint/type/build commands work

## Completed
- None yet.

## Remaining
- All implementation work.

## Files changed
- None yet.

## Tests/checks run
- None yet.

## Verification
- Not started.

## Known issues/blockers
- None yet.

## Next action
Create the minimal extension and backend skeleton.

---

# Feature 02 — Interview overlay UI

## Status
PLANNED

## Priority
P0

## Current task
Build the polished right-side interview panel using mocked session data.

## Acceptance criteria
- [ ] panel renders on the coding page
- [ ] recording indicator exists
- [ ] timer renders
- [ ] interviewer message is visually prominent
- [ ] transcript renders
- [ ] rubric renders
- [ ] Ask for a hint button works in mock mode
- [ ] End & review button works in mock mode
- [ ] responsive behaviour is reasonable
- [ ] styling follows `docs/ui-reference.png`

## Completed
- None yet.

## Remaining
- All implementation work.

## Files changed
- None yet.

## Tests/checks run
- None yet.

## Verification
- Not started.

## Known issues/blockers
- None yet.

## Next action
Build the static visual shell and mount it through the extension.

---

# Feature 03 — LeetCode problem detection

## Status
PLANNED

## Priority
P0

## Acceptance criteria
- [ ] detects supported problem pages
- [ ] extracts title
- [ ] extracts description
- [ ] extracts difficulty
- [ ] handles unsupported pages gracefully

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Implement problem-page detection and a normalised problem model.

---

# Feature 04 — Live code extraction and change detection

## Status
PLANNED

## Priority
P0

## Acceptance criteria
- [ ] detects current language
- [ ] extracts current code
- [ ] detects meaningful code changes
- [ ] debounces updates
- [ ] sends typed code_update events
- [ ] does not send an event for every keystroke

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Implement the editor adapter and debounced code observer.

---

# Feature 05 — Microphone and speech-to-text

## Status
PLANNED

## Priority
P0

## Acceptance criteria
- [ ] microphone permission flow works
- [ ] candidate audio is captured
- [ ] streaming/partial transcript supported where provider allows
- [ ] final transcript events are produced
- [ ] reconnect/error behaviour exists
- [ ] transcript reaches backend

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Implement the browser audio manager and provider interface.

---

# Feature 06 — Interview WebSocket session

## Status
PLANNED

## Priority
P0

## Acceptance criteria
- [ ] session can start
- [ ] typed events flow extension → backend
- [ ] backend → extension events work
- [ ] reconnect behaviour exists
- [ ] malformed events are rejected
- [ ] connection state is reflected in UI

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Define schemas and implement the WebSocket session manager.

---

# Feature 07 — Interview state machine

## Status
PLANNED

## Priority
P0

## Acceptance criteria
- [ ] explicit interview stages exist
- [ ] valid transitions are defined
- [ ] invalid transitions are handled
- [ ] session state persists across events
- [ ] UI receives current stage
- [ ] controller can trigger interviewer actions

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Implement the state model and deterministic transition logic.

---

# Feature 08 — AI interviewer

## Status
PLANNED

## Priority
P0

## Acceptance criteria
- [ ] interviewer receives structured interview state
- [ ] interviewer can ask contextual questions
- [ ] interviewer can remain silent
- [ ] interviewer behaviour changes by stage
- [ ] response is returned in a typed structure
- [ ] prompts are versioned/documented

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Implement interviewer provider interface and controller integration.

---

# Feature 09 — Code analysis

## Status
PLANNED

## Priority
P1

## Acceptance criteria
- [ ] meaningful code snapshots can be analysed
- [ ] syntax/basic correctness information available
- [ ] complexity observations available
- [ ] potential issues available
- [ ] analysis is not triggered on every keystroke
- [ ] interviewer can consume analysis events

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Implement basic AST/static analysis and structured analysis output.

---

# Feature 10 — ElevenLabs interviewer voice

## Status
PLANNED

## Priority
P0

## Acceptance criteria
- [ ] server-side ElevenLabs integration exists
- [ ] interviewer responses can be synthesised
- [ ] audio can stream back to extension
- [ ] playback starts quickly
- [ ] playback errors are handled
- [ ] candidate can mute/disable voice if needed

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Create TTS provider interface and ElevenLabs adapter.

---

# Feature 11 — Tiered hints

## Status
PLANNED

## Priority
P1

## Acceptance criteria
- [ ] Hint 1 is conceptual
- [ ] Hint 2 is more directed
- [ ] Hint 3 can be highly specific
- [ ] hint level is stored in interview state
- [ ] requesting a hint updates the rubric/evidence where appropriate
- [ ] interviewer does not unnecessarily reveal the full solution

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Implement hint policy and UI flow.

---

# Feature 12 — Screen/tab recording

## Status
PLANNED

## Priority
P1

## Acceptance criteria
- [ ] user understands recording state
- [ ] tab/screen capture can start/stop
- [ ] recording errors are handled
- [ ] recording can be stored or finalised after interview
- [ ] code understanding does not depend on OCR

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Implement recording manager and browser permissions.

---

# Feature 13 — Live rubric

## Status
PLANNED

## Priority
P1

## Acceptance criteria
- [ ] rubric categories are defined
- [ ] scores update based on evidence
- [ ] updates are not excessively noisy
- [ ] UI reflects scores
- [ ] score changes can be traced to evidence

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Implement rubric schema and update rules.

---

# Feature 14 — End interview and review

## Status
PLANNED

## Priority
P0

## Acceptance criteria
- [ ] interview can end cleanly
- [ ] final analysis is generated
- [ ] overall score is calculated
- [ ] strengths are evidence-backed
- [ ] weaknesses are evidence-backed
- [ ] important moments are shown chronologically
- [ ] final UI matches product style

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Build final review data model and UI using mocked evidence first.

---

# Feature 15 — Persistence

## Status
PLANNED

## Priority
P1

## Acceptance criteria
- [ ] interview sessions persist
- [ ] transcript persists
- [ ] relevant code snapshots/events persist
- [ ] final review persists
- [ ] secrets remain protected

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Create the minimum required Supabase/Postgres schema and repository layer.

---

# Feature 16 — Integration hardening and demo readiness

## Status
PLANNED

## Priority
P0

## Acceptance criteria
- [ ] complete happy path works
- [ ] extension can reconnect
- [ ] common API failures are handled
- [ ] permissions are understandable
- [ ] latency is acceptable
- [ ] build is reproducible
- [ ] README setup works from a clean environment
- [ ] demo flow is rehearsable end-to-end

## Completed
- None yet.

## Remaining
- All implementation work.

## Next action
Run the full vertical slice and fix blockers.
