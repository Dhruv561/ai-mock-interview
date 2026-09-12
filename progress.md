# progress.md

High-level project dashboard. Update after every meaningful work slice, per `CLAUDE.md`. This file answers: where are we, what's next, what's blocking.

---

## Status: Phase 1 complete (Feature 01 + Feature 02 both DONE)

Last updated: 2026-09-12

## Current phase

**Phase 1 — Repository scaffolding + extension visual shell. Complete.** Feature 01 and Feature 02 are both `DONE`, including real-browser manual verification against a live `leetcode.com` problem page. Ready to move into Phase 2 (LeetCode problem detection + live code extraction).

## Completed

- **Planning (Phase 0):** `architecture.md`, `progress.md`, `TODO.md`, `README.md`, `.env.example` written from a from-scratch repository inspection; pushed to `origin/main`.
- **Feature 01 — repository foundation (DONE):** npm workspace (`extension`, `shared`) + `uv`-managed `backend/`. Extension: Vite 8 + `@crxjs/vite-plugin` + React 19 + TS + Tailwind v4, MV3 manifest scoped to `leetcode.com/problems/*`, ESLint + Vitest/RTL configured. Backend: FastAPI + `/health` route, `pydantic-settings`-based config defaulting to mock providers, pytest + ruff configured. `shared/events.ts` establishes the Zod-schema pattern that will mirror `backend/app/interview/schemas.py` once Phase 3 defines the full event catalogue. `scripts/dev.sh` / `scripts/check.sh` both work; `scripts/check.sh` runs the full lint/typecheck/test/build sequence across both projects and passes end-to-end.
- **Feature 02 — interview overlay UI (DONE):** full interactive mock interview panel — idle start screen → scripted dialogue → tiered hint requests → end & review scorecard. Built with a typed Context+reducer store (`extension/src/state/`), no external state library, so swapping the mock engine for the real WebSocket client later shouldn't touch the components. 9 unit tests passing.
- **Post-review fixes (same day, after the user manually tested the build):** (1) panel was overlaying the LeetCode editor — fixed with `extension/src/content/layout.ts`, which reserves 420px on the viewport edge via `margin-right` on `<html>` so LeetCode's own layout reflows beside the panel; (2) live "RUBRIC SO FAR" section removed from the in-progress panel (rubric now only shown on the Review screen) — a deliberate deviation from PRD §3.3/FR13/`docs/ui-reference.png`, made as a product decision after asking the user to confirm it should override the spec; (3) confirmed the "not recording me, scripted dummy speech" observation is expected — Feature 02 is mock-only by design, real mic/STT is Phase 4. Both fixes verified live against a real `leetcode.com/problems/two-sum` page via `claude-in-chrome` browser automation (connected this session, unlike the previous one).

## In progress

Nothing — Phase 1 is complete.

## Next

Phase 2 (Feature 03/04) — LeetCode problem detection + live code extraction, per `TODO.md`.

See `TODO.md` for the full granular breakdown and `FEATURE_PROGRESS.md` for the authoritative per-feature checkpoint records.

## Known issues / blockers

- `npm install` at the workspace root requires `--legacy-peer-deps` — a known npm/arborist resolver crash (`Cannot read properties of null (reading 'edgesOut')`) triggered by vitest's optional browser-mode peer packages, unrelated to any version choice made here. Anyone re-running install from a clean checkout needs the same flag; called out in `README.md` and `FEATURE_PROGRESS.md` Feature 01.
- No external API keys configured — not needed until Phase 4 (STT) / Phase 6 (LLM) / Phase 7 (TTS); mock providers cover the happy path until then (`architecture.md` §S).

## Decisions log (Phase 1 additions)

| Date | Decision | Why |
|---|---|---|
| 2026-09-12 | `npm install` needs `--legacy-peer-deps` at the workspace root | npm/arborist crashes resolving vitest 5's optional browser-mode peers (`msw`, `webdriverio`, `@vitest/browser`, `@vitest/ui`); not fixable by a different version pin without downgrading vitest |
| 2026-09-12 | Rubric UI shows all 6 FR13 categories, not just the 4 visible in `docs/ui-reference.png` | The reference screenshot is illustrative/truncated, not a scope cut — PRD FR13 explicitly specifies 6 categories |
| 2026-09-12 | Mock interview dialogue in `state/mockEngine.ts` intentionally replays the exact exchange from `docs/ui-reference.png` | Gives a direct, honest visual comparison against the design target instead of an arbitrary placeholder script |
| 2026-09-12 | ~~Interview panel is a fixed overlay~~ — **superseded same day**: panel reflows LeetCode's page via `margin-right` on `<html>` (`content/layout.ts`) | User flagged the overlay blocking the code editor as a must-fix before Phase 2; the reflow technique turned out simple enough to do immediately rather than defer |
| 2026-09-12 | Live "RUBRIC SO FAR" section removed from the in-progress panel; rubric only shown on the Review screen — deviates from PRD §3.3/FR13/`docs/ui-reference.png` | Product decision by the user after manually testing the build and finding live numeric scores distracting mid-interview; confirmed explicitly (not assumed) since it overrides a documented spec. Backend-side rubric computation/events are unaffected — this is a UI-rendering-only change (architecture.md §O) |

## Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-09-12 | Anthropic Claude as interviewer/evaluator LLM | Structured JSON via tool-use is reliable; PRD left provider open |
| 2026-09-12 | Deepgram for streaming STT | Accepts WebM/Opus directly from `MediaRecorder`, no client transcoding |
| 2026-09-12 | Content script owns UI + media capture + WS connection; background service worker kept minimal | MV3 service workers are evicted arbitrarily; session-critical state can't live there |
| 2026-09-12 | `getUserMedia`/`getDisplayMedia` from content script instead of `chrome.tabCapture` | Simpler permission model, matches explicit-permission UX requirement |
| 2026-09-12 | React Context + `useReducer`, no external state library | CLAUDE.md: avoid unnecessary state-management dependencies; event stream maps directly onto reducer actions |
| 2026-09-12 | Hand-mirrored Pydantic ↔ TS/Zod schemas, drift caught via shared fixture contract tests, not codegen | Codegen pipeline is more infra than ~15 event types justify at this scale |
| 2026-09-12 | Persistence: `interview_sessions` table with a few relational columns + JSONB blobs, not a fully normalized schema | Hackathon-appropriate tradeoff; revisit only if a real need to query across sessions emerges |
| 2026-09-12 | Python `ast`-based static analysis for Python only; other languages get LLM-only analysis | Multi-language static analyzers are out of scope; Python is the default demo language |
| 2026-09-12 | Local demo runs backend + extension locally by default; hosted backend is optional stretch | Lowest latency and reliability during actual judging, no third-party uptime dependency |

## Milestone table

Mirrors `FEATURE_PROGRESS.md`; see that file for full acceptance criteria and checkpoint detail.

| # | Feature | Status | Priority |
|---|---|---|---|
| 01 | Repository and project foundation | DONE | P0 |
| 02 | Interview overlay UI (mocked data) | DONE | P0 |
| 03 | LeetCode problem detection | PLANNED | P0 |
| 04 | Live code extraction and change detection | PLANNED | P0 |
| 05 | Microphone and speech-to-text | PLANNED | P0 |
| 06 | Interview WebSocket session | PLANNED | P0 |
| 07 | Interview state machine | PLANNED | P0 |
| 08 | AI interviewer | PLANNED | P0 |
| 09 | Code analysis | PLANNED | P1 |
| 10 | ElevenLabs interviewer voice | PLANNED | P0 |
| 11 | Tiered hints | PLANNED | P1 |
| 12 | Screen/tab recording | PLANNED | P1 |
| 13 | Live rubric | PLANNED | P1 |
| 14 | End interview and review | PLANNED | P0 |
| 15 | Persistence | PLANNED | P1 |
| 16 | Integration hardening and demo readiness | PLANNED | P0 |
