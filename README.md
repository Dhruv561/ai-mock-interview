# AI Mock Interview

A Chrome extension that turns a LeetCode coding problem into a realistic AI-driven technical interview: it listens to you talk through your approach, watches your code as you write it, asks contextual follow-up questions in an interviewer's voice (ElevenLabs), gives tiered hints on request, and produces an evidence-grounded scorecard at the end.

LeetCode stays the main workspace. The extension adds a persistent right-side interview panel — not a separate chatbot tab.

## Project status

**Phase 1 (repo scaffolding + mocked interview panel UI) is implemented.** The extension boots, builds, and runs a fully interactive mocked interview (no backend required); the backend boots and serves a health check. See `progress.md` for the current dashboard and `TODO.md` for the full task breakdown. No AI/speech/backend wiring exists yet — that's Phase 2 onward.

## Documentation map

| File | Purpose |
|---|---|
| `PRD.md` | Product requirements — the source of truth for *what* to build |
| `CLAUDE.md` | Operating instructions for AI-assisted development on this repo |
| `architecture.md` | Living technical design — the source of truth for *how* it's built |
| `progress.md` | Project dashboard: current phase, decisions log, blockers |
| `TODO.md` | Phase-ordered, granular task breakdown |
| `FEATURE_PROGRESS.md` | Authoritative per-feature checkpoint records |
| `docs/ui-reference.png` | Visual target for the interview panel |

## Architecture at a glance

```text
Chrome Extension (content script owns UI + media + WebSocket)
  ├─ LeetCode adapter: problem extraction, live code reading
  ├─ Interview panel: React, Context+reducer, Tailwind, shadow-DOM mounted
  └─ Media: mic (getUserMedia) + optional screen/tab (getDisplayMedia)
         │
         │  single WebSocket, typed JSON events + binary audio frames
         ▼
FastAPI backend
  ├─ Interview state machine (explicit stages, deterministic transitions)
  ├─ Interview controller (decides: silent / ask / hint / transition — enforces product rules)
  ├─ Interviewer + evaluator agents (Anthropic Claude, structured JSON output)
  ├─ Code analysis (Python AST for Python, LLM-only for other languages)
  ├─ Speech-to-text (Deepgram, streaming)
  ├─ Text-to-speech (ElevenLabs, streaming)
  └─ Persistence (Postgres/Supabase in prod, in-memory in local dev)
```

Full detail, including per-subsystem responsibilities, inputs/outputs, testing strategy, and risks, is in `architecture.md`.

## Repository layout

```text
extension/   Chrome extension — Vite + React + TypeScript + Tailwind (npm workspace)
backend/     FastAPI backend — Python, managed with uv
shared/      Hand-mirrored event schemas (Zod on the TS side, Pydantic on the Python side; npm workspace)
scripts/     dev.sh (run everything locally), check.sh (lint/type/test/build)
docs/        Design reference and supporting docs
```

## Local development

Prerequisites: Node 20+, Python 3.11+, [`uv`](https://docs.astral.sh/uv/).

```bash
cp .env.example .env
npm install --legacy-peer-deps   # see note below
(cd backend && uv sync)
./scripts/dev.sh   # runs backend (uv) + extension dev build (npm) concurrently
```

`--legacy-peer-deps` is currently required: `npm install` otherwise hits a known npm/arborist resolver crash on vitest's optional browser-mode peer packages. Not specific to any version choice made here — see `progress.md`'s decisions log.

By default `USE_MOCK_PROVIDERS=true`, so the entire happy path runs with **no API keys at all** once the backend's mock providers land in later phases. See `architecture.md` §S.

To load the extension in Chrome: `chrome://extensions` → Developer mode → Load unpacked → `extension/dist` (run `npm run --workspace extension build` first, or use `npm run --workspace extension dev` for a watch build). The panel currently runs a fully scripted mock interview (Feature 02) — no backend connection yet.

To run all checks (lint/typecheck/test/build, both projects): `./scripts/check.sh`.

## Environment variables

See `.env.example` for the full list, documented in `architecture.md` §U. Provider secrets (Anthropic, Deepgram, ElevenLabs, Supabase) are backend-only and are never bundled into the extension.

## Contributing / workflow

This project follows the development workflow and stop protocol defined in `CLAUDE.md`: work proceeds in small vertical slices, each feature has a checkpoint record in `FEATURE_PROGRESS.md`, and `progress.md` is kept current after every meaningful slice.
