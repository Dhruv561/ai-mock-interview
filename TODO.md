# TODO.md

Granular, phase-ordered task breakdown. Each phase maps to one or more features in `FEATURE_PROGRESS.md` (authoritative for acceptance criteria and checkpoint state — this file is a working task list, not a second source of truth for status).

Phases follow PRD.md §18's suggested build order, sequenced as vertical slices per `CLAUDE.md` principle 1.

---

## Phase 0 — Repository and planning ✅ (this pass)

- [x] Inspect repository, read PRD/CLAUDE/FEATURE_PROGRESS, view UI reference
- [x] Write `architecture.md`
- [x] Write `progress.md`
- [x] Write `TODO.md`
- [x] Write `README.md`

## Phase 1 — Repository scaffolding + extension visual shell (Feature 01, 02)

### Feature 01 — scaffolding
- [ ] `extension/`: `package.json`, `vite.config.ts` (`@crxjs/vite-plugin` + `@vitejs/plugin-react`), `tsconfig.json`, Tailwind config
- [ ] `extension/src/manifest.ts`: MV3 manifest, `host_permissions` for `leetcode.com`, `scripting`/`storage` permissions
- [ ] `backend/`: `pyproject.toml` via `uv`, FastAPI + uvicorn + pydantic deps, `app/main.py` boots with a health-check route
- [ ] `shared/events.ts`: empty Zod scaffold + `shared/README.md` sync policy note
- [ ] `.env.example` with every variable from `architecture.md` §U
- [ ] `scripts/dev.sh`, `scripts/check.sh`
- [ ] Verify: `npm install && npm run build` in `extension/` succeeds; `uv sync && uv run uvicorn app.main:app` boots in `backend/`

### Feature 02 — interview panel visual shell (mocked data, no backend)
- [ ] Shadow-DOM mount point in content script
- [ ] `StatusIndicator.tsx` — RECORDING / ANALYSING / PAUSED states, elapsed timer
- [ ] `Transcript.tsx` — historical messages + visually prominent current interviewer message (per `docs/ui-reference.png`)
- [ ] `Rubric.tsx` — category bars matching the reference's proportion-bar style
- [ ] `HintButton.tsx`, `Review.tsx` (end state)
- [ ] `interviewStore.tsx` — Context + reducer, seeded with mock/fixture data for this phase
- [ ] Tailwind theme matching the reference palette: off-white/sage background, thin borders, dark text, muted green accent, monospace uppercase labels, dark-pill primary button / outline secondary button
- [ ] Manual verification: load unpacked in Chrome against a real LeetCode problem page, compare visually against `docs/ui-reference.png`

## Phase 2 — LeetCode integration (Feature 03, 04)

- [ ] `leetcode.ts`: detect `/problems/<slug>` pages, extract title/difficulty/description
- [ ] `mainWorldBridge.ts`: MAIN-world injected script reading Monaco model value
- [ ] `editor.ts`: isolated-world adapter consuming bridge messages, DOM-scrape fallback
- [ ] Debounced code-change detector (time + diff-size threshold, per `architecture.md` §L rule 3)
- [ ] Manual verification against 2–3 real problems with varying starter code

## Phase 3 — Real-time transport (Feature 06)

- [x] `backend/app/interview/schemas.py`: Pydantic models for full event catalogue (`architecture.md` §G)
- [x] `shared/events.ts`: Zod mirror of the same catalogue
- [x] `shared/fixtures/*.json` + contract tests on both sides
- [x] `backend/app/websocket/interview.py`: WS endpoint, session registry, seq-numbered dispatch
- [x] `extension/src/networking/websocket.ts`: connect, reconnect w/ backoff, `session.resume` replay handling
- [x] Malformed-event rejection test
- [x] Reconnect/replay integration test

## Phase 4 — Microphone + STT (Feature 05)

- [x] `microphone.ts`: `getUserMedia`, `MediaRecorder` chunking, permission-denied UX
- [x] `providers/stt/base.py`, `mock.py`, `deepgram.py`
- [x] `dev.simulate_transcript` event wired end-to-end (mock-mode gated)
- [ ] Manual verification with a real mic + Deepgram key — still open, needs a real key + a machine where the browser can reach the backend (see `FEATURE_PROGRESS.md` Feature 05/06)

## Phase 5 — Interview state machine (Feature 07)

- [x] `backend/app/interview/state.py`: `InterviewState` model, stage enum, transition table
- [x] Unit tests: every legal transition succeeds, every illegal one rejected
- [x] Wire `interviewer.state` events to the UI — as a new `StageBadge` next to `StatusIndicator`, not a rewrite of it (that component stays mock-engine-driven until Feature 08 replaces the mock engine itself)

## Phase 6 — AI interviewer + controller (Feature 08)

- [x] `providers/llm/base.py`, `mock.py`, `anthropic.py`
- [x] `agents/interviewer.py` + `interview/prompts.py` (versioned, stage-specific)
- [x] `interview/controller.py`: silence/cooldown/dedup/debounce rules per `architecture.md` §L
- [x] Unit tests over the gating rules using synthetic event sequences
- [ ] Manual verification: real code + real transcript produces a contextually relevant question — still open, needs a real `ANTHROPIC_API_KEY` (the mock path is fully verified, but "contextually relevant" is inherently unverifiable without a real model — see `FEATURE_PROGRESS.md` Feature 08)

## Phase 7 — ElevenLabs TTS (Feature 10)

- [x] `providers/tts/base.py`, `mock.py`, `elevenlabs.py`
- [x] Streaming audio relay over WS (`interviewer.audio.start/end` + binary frames)
- [x] Client-side `AudioContext` chunk player
- [ ] Failure-path manual test: kill the key, confirm text still appears — needs a real key to "kill"; the mock provider already exercises the zero-audio path, and TTS exceptions are caught server-side, but a live real→dead-key transition hasn't been run

## Phase 8 — Hints + rubric (Feature 09, 11, 13)

- [x] `agents/code_analyser.py`: Python `ast`-based analysis + fixture tests
- [x] Hint level policy in controller + per-level prompts
- [x] Rubric sub-model in `InterviewState`, evidence-required schema, `rubric.updated` events
- [~] `Rubric.tsx` wired to live events — deliberately NOT done: architecture.md §O records a product decision that the live panel never renders rubric mid-interview (only the post-interview Review screen does, Feature 14). `Rubric.tsx` stays on its Feature 02 mock data as the live panel's (unused-for-rubric) placeholder; real wiring happens in Feature 14 instead.

## Phase 9 — Final review (Feature 14)

- [x] `agents/evaluator.py`: full-session evidence-grounded review generation
- [x] Evidence-id verification pass (reject/retry once if a cited id doesn't exist in the record)
- [x] `Review.tsx` wired to `review.ready`

## Phase 10 — Screen recording + polish (Feature 12)

- [x] `screen.ts`: `getDisplayMedia`, local `MediaRecorder` buffering (upload endpoint deferred — no consumer exists yet)
- [x] Recording indicator (`ScreenBadge.tsx`, mirrors `MicBadge.tsx`)
- [ ] Error-state UI pass across all `architecture.md` §V scenarios — still open, broader than just screen capture

## Phase 11 — Persistence + end-to-end hardening (Feature 15, 16)

- [x] `persistence/repository.py`, `in_memory.py`, `postgres.py`
- [ ] Full happy-path integration test: `start → transcript → code_update → question → hint → end → review`
- [ ] README setup verified from a clean checkout
- [ ] Repeated full manual runs; fix latency/race/UI-overflow/state bugs found
- [ ] Demo rehearsal

---

## Definition of done for the MVP

All 15 checklist items in PRD.md §16, restated as one checklist:

- [ ] Extension + backend run locally per README
- [ ] Supported LeetCode problem opens and is detected
- [ ] Interview starts, persistent recording indicator visible
- [ ] Interviewer panel visible and matches the design reference
- [ ] Microphone speech is captured and transcribed live
- [ ] Meaningful code changes are detected (debounced, not per-keystroke)
- [ ] At least one contextually relevant AI question fires based on real speech/code
- [ ] Interviewer is heard via ElevenLabs
- [ ] At least one hint can be requested and received
- [ ] Interview can be completed and ended
- [ ] Final scorecard renders with evidence-based feedback
- [ ] No API secrets present in the built extension bundle (tripwire check passes)
- [ ] A temporary WebSocket disconnect is recovered from without losing session state
