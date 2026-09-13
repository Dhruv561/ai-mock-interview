# AI Mock Interview

A Chrome extension that turns a LeetCode coding problem into a realistic AI-driven technical interview: it listens to you talk through your approach, watches your code as you write it, asks contextual follow-up questions in an interviewer's voice (ElevenLabs), gives tiered hints on request, and produces an evidence-grounded scorecard at the end.

LeetCode stays the main workspace. The extension adds a persistent right-side interview panel — not a separate chatbot tab.

## Project status

**The full MVP pipeline is built.** LeetCode problem/code extraction, the real-time WebSocket transport, mic capture with Deepgram speech-to-text, the backend interview state machine, an AI interviewer (Anthropic Claude, with a deterministic mock fallback), ElevenLabs text-to-speech, static code analysis, tiered hints, an evidence-based live rubric, an evidence-grounded final review, screen/tab recording, and session persistence are all implemented and covered by automated tests against mock providers. Almost every feature is `VERIFIED`; a few are `DONE`. Only Feature 16 (integration hardening and demo readiness) remains.

`VERIFIED` is not `DONE`: several features (05, 08, 10, 11, 13, 14, 15) are implemented and tested end-to-end against mock providers, but still need a live pass with real `ANTHROPIC_API_KEY`/`DEEPGRAM_API_KEY`/`ELEVENLABS_API_KEY`/`DATABASE_URL` values before they can be marked `DONE` — that's a credentials/live-verification gap, not missing implementation. See `progress.md` for the current dashboard and `FEATURE_PROGRESS.md` for full per-feature acceptance criteria and status. `DEMO.md` has a step-by-step demo rehearsal script.

## Documentation map

| File | Purpose |
|---|---|
| `PRD.md` | Product requirements — the source of truth for *what* to build |
| `CLAUDE.md` | Operating instructions for AI-assisted development on this repo |
| `architecture.md` | Living technical design — the source of truth for *how* it's built |
| `progress.md` | Project dashboard: current phase, decisions log, blockers |
| `TODO.md` | Phase-ordered, granular task breakdown |
| `FEATURE_PROGRESS.md` | Authoritative per-feature checkpoint records |
| `DEMO.md` | Step-by-step demo rehearsal script |
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
cp .env.example backend/.env     # NOTE: backend/, not the repo root — see below
npm install --legacy-peer-deps   # see note below
(cd backend && uv sync)
./scripts/dev.sh   # runs backend (uv) + extension dev build (npm) concurrently
```

`--legacy-peer-deps` is currently required: `npm install` otherwise hits a known npm/arborist resolver crash on vitest's optional browser-mode peer packages. Not specific to any version choice made here — see `progress.md`'s decisions log.

**The env file must live at `backend/.env`, not the repo root.** `scripts/dev.sh` starts the backend with `cd backend`, and pydantic-settings resolves `env_file=".env"` against the process working directory — so a root-level `.env` is silently ignored and every key in it appears unset. Verified empirically; easy to lose an hour to.

By default `USE_MOCK_PROVIDERS=true`, so the entire happy path runs with **no API keys at all**. Two things to know when you do add a key:

- `USE_MOCK_PROVIDERS=true` overrides **every** key, so adding one changes nothing until you also set it to `false`.
- Each provider then falls back to its own mock independently (`if use_mock_providers or not <key>`), so setting only `DEEPGRAM_API_KEY` gives you real speech-to-text while the interviewer LLM stays mocked. You don't have to enable everything at once.
- `get_settings()` is `@lru_cache`d, so a changed key needs a real backend restart — uvicorn's `--reload` will not pick it up.

See `architecture.md` §S.

To load the extension in Chrome: `chrome://extensions` → Developer mode → Load unpacked → `extension/dist` (run `npm run --workspace extension build` first, or use `npm run --workspace extension dev` for a watch build). Reload the extension from that page after any rebuild — a manifest or service-worker change in particular does not hot-reload.

The panel connects to a live local backend: start the backend, open a LeetCode problem, click **Start AI Interview**, and the header badge should reach `BACKEND CONNECTED`.

To run all checks (lint/typecheck/test/build, both projects): `./scripts/check.sh`.

## Environment variables

See `.env.example` for the full list, documented in `architecture.md` §U. Provider secrets (Anthropic, Deepgram, ElevenLabs, Supabase) are backend-only and are never bundled into the extension.

`.env` and `.env.*` are gitignored at any depth (with `.env.example` excepted), so `backend/.env` cannot be committed. The test suite forces mock providers via `backend/tests/conftest.py` — without that, a real key in `backend/.env` makes the suite open billable connections to live third-party APIs.

## Contributing / workflow

This project follows the development workflow and stop protocol defined in `CLAUDE.md`: work proceeds in small vertical slices, each feature has a checkpoint record in `FEATURE_PROGRESS.md`, and `progress.md` is kept current after every meaningful slice.
