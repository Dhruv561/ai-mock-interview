# progress.md

High-level project dashboard. Update after every meaningful work slice, per `CLAUDE.md`. This file answers: where are we, what's next, what's blocking.

---

## Status: Phase 3 done (Feature 04 DONE, Feature 06 VERIFIED — one optional live check open)

Last updated: 2026-09-12

## Current phase

**Phase 3 — Real-time transport, complete.** Feature 06 (WebSocket session) is `VERIFIED`: full typed event catalogue, backend WS session manager (start/resume/replay/malformed-rejection), extension client (reconnect+backoff+resume), and a connection-state badge in the UI — all covered by real automated tests (backend: genuine ASGI-level `TestClient.websocket_connect` integration tests; extension: full client-state-machine simulation). One live browser↔live-backend round trip is still open, blocked by a tooling/network-isolation constraint this session (see `FEATURE_PROGRESS.md` Feature 06 and `architecture.md` §4) — not a known code defect. Feature 04's previously-tracked gap (sending real `code.update` events) closed as part of this, now `DONE`. Next: Phase 4 (Feature 05 — microphone + STT).

## Completed

- **Planning (Phase 0):** `architecture.md`, `progress.md`, `TODO.md`, `README.md`, `.env.example` written from a from-scratch repository inspection; pushed to `origin/main`.
- **Phase 1 (Feature 01 + 02, DONE):** npm workspace scaffolding (extension + backend + shared), and a fully interactive mocked interview panel UI. Post-review fixes: panel now reflows beside the LeetCode editor instead of overlaying it; live rubric hidden until the Review screen (deliberate PRD deviation, confirmed with the user). See git history for full detail — not re-summarized here.
- **Phase 2 (Feature 03 + 04):**
  - `content/leetcode.ts` — problem detection/extraction. Selectors (`.text-title-large`, `[class*="text-difficulty-"]`, `[data-track-load="description_content"]`, `[data-track-load="code_editor"]`) were confirmed live against real LeetCode markup via `claude-in-chrome` browser inspection *before* writing any extraction code — not guessed.
  - `content/mainWorldBridge.ts` — new MV3 manifest content script running in the page's MAIN world (`world: "MAIN"`), the only way to reach `window.monaco` (isolated-world content scripts can't see it). Talks to the isolated world via `window.postMessage`. Disambiguates the real code editor among multiple Monaco models on the page by checking which one's DOM node lives inside `[data-track-load="code_editor"]`.
  - `content/editor.ts` + `content/codeChangeDetector.ts` — bridge-first/DOM-scrape-fallback snapshot reading, and a pure, unit-tested debounce+diff-size gate (settle for 2.5s, then only emit if the change clears a minimum size against the last emission) so code changes are never sent on every keystroke.
  - Verified live across 3 real problems (Two Sum/Easy, Merge Intervals/Medium, Add Two Numbers/Medium), plus the SPA re-mount lifecycle (MutationObserver-based) confirmed correct on a clean content-script instance.
- **Phase 3 (Feature 06):**
  - `backend/app/interview/schemas.py` + `shared/events.ts` — full typed event catalogue (architecture.md §G) as hand-mirrored Pydantic/Zod discriminated unions, contract-tested against shared JSON fixtures on both sides.
  - `backend/app/websocket/interview.py` — `/ws/interview` endpoint: in-memory session registry with a 5-minute resume grace window and a 200-event ring buffer, malformed/invalid/out-of-order events answered with a typed `error` event instead of closing the connection.
  - `extension/src/networking/websocket.ts` — framework-agnostic client with exponential-backoff reconnect and automatic `session.resume`; `interviewSocket.ts` singleton + `ConnectionBadge` reflect connection state in the panel header.
  - `content/index.tsx` now sends real `session.start`/`code.update` events instead of only logging them — closes Feature 04's previously-open gap.
  - Also fixed a real bug found while wiring this up: the WS schemas required `ProblemInfo.number`/`difficulty`, but `content/leetcode.ts` legitimately returns them as `null` on best-effort extraction — schemas corrected on both sides to match.

## In progress

Nothing actively blocking. Phase 3 has one optional follow-up: a genuine browser↔live-backend round trip couldn't be exercised this session because the automated Chrome instance couldn't reach this session's `localhost:8000` at all (network-isolation between the two, not a code issue — see `architecture.md` §4). Worth a quick manual check next session (run the backend, open a LeetCode problem, confirm the header badge reaches "BACKEND CONNECTED") before treating Feature 06 as fully `DONE`.

## Next

Phase 4 (Feature 05) — microphone + speech-to-text: browser audio capture, STT provider interface (mock + Deepgram), streaming partial/final transcript events sent over the now-working WebSocket transport. Per `TODO.md`.

See `TODO.md` for the full granular breakdown and `FEATURE_PROGRESS.md` for the authoritative per-feature checkpoint records.

## Known issues / blockers

- `npm install` at the workspace root requires `--legacy-peer-deps` — a known npm/arborist resolver crash (`Cannot read properties of null (reading 'edgesOut')`) triggered by vitest's optional browser-mode peer packages, unrelated to any version choice made here. Anyone re-running install from a clean checkout needs the same flag; called out in `README.md` and `FEATURE_PROGRESS.md` Feature 01.
- No external API keys configured — not needed until Phase 4 (STT) / Phase 6 (LLM) / Phase 7 (TTS); mock providers cover the happy path until then (`architecture.md` §S).
- This session's browser console-log tool didn't reliably capture repeated content-script-origin messages (see `FEATURE_PROGRESS.md` Feature 04's Verification note) — not a product issue, but worth knowing before relying on it for the next phase's live testing; direct DOM-state inspection via the JS-exec tool was the reliable fallback.
- This session's `claude-in-chrome` automated browser could not reach `localhost:8000`/`127.0.0.1:8000` at all (a plain `fetch` timed out) even while this session's own shell could `curl` the same backend successfully — the two are on different hosts/network namespaces. Blocks a true live browser↔backend round trip for WS-dependent features (06 onward) from this tool; see `architecture.md` §4 and `FEATURE_PROGRESS.md` Feature 06 for the workaround (automated ASGI-level backend tests + simulated-socket extension tests) and the one manual check still worth doing on a machine where both share a network.

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

## Decisions log (Phase 3 additions)

| Date | Decision | Why |
|---|---|---|
| 2026-09-12 | `ProblemInfo.number`/`difficulty` are nullable in the WS schemas (`backend/app/interview/schemas.py`, `shared/events.ts`), not required | Caught mid-implementation: `content/leetcode.ts`'s extraction already legitimately returns `null` for these on best-effort parsing failure; the WS contract was written from Phase 0 planning assumptions before that code existed and needed correcting to match reality, not the other way around |
| 2026-09-12 | Full event catalogue (all 20 event types) defined as Pydantic/Zod contracts now, even though only ~12 are produced/consumed by any logic yet | CLAUDE.md explicitly requires typed contracts for this list of event types, and `architecture.md` §G already committed to this exact catalogue during Phase 0 planning; defining the shape without the behavior isn't speculative here, it's the documented Phase 3 deliverable — each unused type is commented with which future feature (07/08/10/11/13/14) will emit it |

## Milestone table

Mirrors `FEATURE_PROGRESS.md`; see that file for full acceptance criteria and checkpoint detail.

| # | Feature | Status | Priority |
|---|---|---|---|
| 01 | Repository and project foundation | DONE | P0 |
| 02 | Interview overlay UI (mocked data) | DONE | P0 |
| 03 | LeetCode problem detection | DONE | P0 |
| 04 | Live code extraction and change detection | DONE | P0 |
| 05 | Microphone and speech-to-text | PLANNED | P0 |
| 06 | Interview WebSocket session | VERIFIED | P0 |
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
