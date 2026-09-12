# progress.md

High-level project dashboard. Update after every meaningful work slice, per `CLAUDE.md`. This file answers: where are we, what's next, what's blocking.

---

## Status: PLANNING COMPLETE — awaiting go-ahead for Phase 1

Last updated: 2026-09-12

## Current phase

**Phase 0 — Repository and planning.**

The repository was inspected and found to contain only planning material (`PRD.md`, `CLAUDE.md`, `FEATURE_PROGRESS.md`, `docs/ui-reference.png`) — no code, no scaffolding, no dependencies installed. `architecture.md`, this file, `README.md`, and `TODO.md` were written from that inspection, not assumed. Local toolchain confirmed: Node v23.11.0 / npm 10.9.2, Python 3.14.7, `uv` available (no `poetry`).

## Completed

- Read `PRD.md` in full.
- Read `CLAUDE.md`, `FEATURE_PROGRESS.md`.
- Inspected `docs/ui-reference.png` — informs the exact visual target recorded in `architecture.md` §C and `TODO.md`.
- Wrote `architecture.md`: repo layout, extension/backend/UI architecture, event catalogue, all 23 subsystem specs (A–W), open risks.
- Wrote this file.
- Wrote `TODO.md`: phase-ordered, feature-mapped task breakdown.
- Wrote `README.md`.
- Confirmed key technology decisions (see `architecture.md` §1 deviation table): Anthropic Claude for LLM, Deepgram for STT, ElevenLabs for TTS (per PRD), Postgres/Supabase for persistence, content-script-owned media capture instead of `chrome.tabCapture`, React Context+reducer instead of a state library, hand-mirrored TS/Pydantic schemas with a shared-fixture contract test instead of codegen.

## In progress

Nothing — planning deliverables are complete. Next work is the first implementation slice (Phase 1 / Feature 01 + Feature 02), not yet started.

## Next

1. Feature 01 — repository scaffolding: `extension/` (Vite + `@crxjs/vite-plugin` + React + TS + Tailwind), `backend/` (`uv`-managed FastAPI project), `shared/` (Zod schemas), `.env.example`, `scripts/dev.sh` / `scripts/check.sh`.
2. Feature 02 — interview panel visual shell, built against **mocked** interview data (no backend dependency yet), matching `docs/ui-reference.png` exactly. This is deliberately sequenced before any backend/AI wiring per PRD §18 Phase 1 and CLAUDE.md's "build the mocked UI early" instruction.

See `TODO.md` for the full granular breakdown and `FEATURE_PROGRESS.md` for the authoritative per-feature checkpoint records.

## Known issues / blockers

- None. No external API keys have been requested or configured yet — not needed until Phase 4 (STT) / Phase 6 (LLM) / Phase 7 (TTS), and all three have mock providers so the happy path is demoable without any of them (see `architecture.md` §S).
- Awaiting confirmation to proceed from planning into Phase 1 implementation (repo scaffolding touches a lot of generated boilerplate — package.json/tsconfig/vite config/manifest — worth one checkpoint before generating it, per `CLAUDE.md`'s deliberate checkpoint culture).

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
| 01 | Repository and project foundation | PLANNED | P0 |
| 02 | Interview overlay UI (mocked data) | PLANNED | P0 |
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
