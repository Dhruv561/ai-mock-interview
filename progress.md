# progress.md

High-level project dashboard. Update after every meaningful work slice, per `CLAUDE.md`. This file answers: where are we, what's next, what's blocking.

---

## Status: Phase 5 done (Feature 07 VERIFIED — one criterion blocked on Feature 08)

Last updated: 2026-09-13

## Current phase

**Phase 5 — Interview state machine, complete.** Feature 07 is `VERIFIED`: `InterviewState` (architecture.md §I) with an exhaustively-tested transition table, wired into the WS layer so `code.update`/`hint.requested`/candidate speech now write into real per-session state instead of falling into the old "accepted but inert" bucket, and `interviewer.state` events reach the UI via a new `StageBadge`. One of the six acceptance criteria ("controller can trigger interviewer actions") is intentionally unchecked — it requires Feature 08's LLM/controller to exist at all, which architecture.md §L itself says is "folded into Features 07/08," not Feature 07's alone. Next: Phase 6 (Feature 08 — AI interviewer + controller), which both closes that criterion and is what will finally replace the mock engine driving the visible transcript panel — real speech still doesn't appear there yet because nothing consumes `transcript.partial`/`final`/`interviewer.state` into the UI's transcript until then.

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
- **Phase 4 (Feature 05):**
  - `extension/src/media/microphone.ts` — `getUserMedia` wrapper that never throws (denial/no-hardware → `null`), 250ms chunked `MediaRecorder` capture with an injectable factory for testing.
  - `extension/src/media/useMicrophoneCapture.ts` + `components/MicBadge.tsx` — React hook + status badge wired into `InterviewPanel.tsx`'s Start/End handlers, independent of the mock engine that still drives the visible interview.
  - `extension/src/networking/websocket.ts` — `sendAudioChunk()` added: raw binary WS frames, no JSON envelope, dropped (not queued) without an open connection + active session.
  - `backend/app/providers/stt/{base,mock,deepgram}.py` — provider interface; mock accepts real audio but doesn't fabricate transcripts (the honest choice — `dev.simulate_transcript` is the real mock-mode path for exercising the pipeline); Deepgram implemented against their documented streaming API but unverified live (no key available).
  - `backend/app/websocket/interview.py` — reworked to branch on binary vs. text frames, relay audio to the session's STT provider, route STT-callback-originated events through a fresh per-emit lookup of the session's *currently attached* connection (not a stale closure) so they survive a reconnect, and degrade gracefully if the STT provider fails to start instead of killing the session.
  - **Architecture correction:** `transcript.final` moved from the client to the server event catalogue (see Phase 4/Feature 05 note above) — documented per CLAUDE.md's "do not silently change requirements" rule.
- **Phase 5 (Feature 07):**
  - `backend/app/interview/state.py` — `InterviewState` (pure Pydantic, no I/O) with the full field list CLAUDE.md's "treat interview state as the core domain object" principle specifies; a transition table where `review` is deliberately reachable from every stage (not just the coding loop) since a candidate can end early at any point — an interpretation beyond §I's literal arrow diagram, documented inline.
  - `backend/app/websocket/interview.py` — `SessionRecord.problem`/`.language` collapsed into one `state: InterviewState`; `code.update`/`hint.requested`/candidate speech (`dev.simulate_transcript` and real STT) now write into it instead of being inert; `interviewer.state` sent on session start (stage=intro) and session end (stage=review, idempotently).
  - `extension/src/networking/useInterviewStage.ts` + `components/StageBadge.tsx` — consume `interviewer.state` and show it in the live panel, independent of the mock engine.
  - Live check: mic permission from Feature 05's earlier test session was still granted, so this session's live click-through showed genuine "MIC ON" capture, not just a pending prompt.

## In progress

Nothing actively blocking. Three features (05, 06, 07) share one optional follow-up: a genuine browser↔live-backend round trip couldn't be exercised this session because the automated Chrome instance couldn't reach this session's `localhost:8000` at all (network-isolation between the two, not a code issue — see `architecture.md` §4). Feature 05 additionally needs a real `DEEPGRAM_API_KEY` to test the non-mock STT path (mic permission itself is no longer a gap — see above). Worth doing together next session: run the backend, open a LeetCode problem, confirm the header badge reaches "BACKEND CONNECTED" and the stage badge shows a real stage, and either speak (with a real key) or use `dev.simulate_transcript` to see a transcript arrive.

## Next

Phase 6 (Feature 08) — AI interviewer + controller: LLM provider interface (mock + Anthropic) in `backend/app/providers/llm/`, `agents/interviewer.py` producing structured actions from `InterviewState`, and `interview/controller.py` enforcing the deterministic gating rules from architecture.md §L (never interrupt candidate speech, cooldown between utterances, debounce code-triggered LLM calls, reject near-duplicate questions, only apply legal stage transitions, cap hints at level 3). This is also what will finally wire real transcript/interviewer events into the visible UI, replacing the mock engine. Per `TODO.md`.

See `TODO.md` for the full granular breakdown and `FEATURE_PROGRESS.md` for the authoritative per-feature checkpoint records.

## Known issues / blockers

- `npm install` at the workspace root requires `--legacy-peer-deps` — a known npm/arborist resolver crash (`Cannot read properties of null (reading 'edgesOut')`) triggered by vitest's optional browser-mode peer packages, unrelated to any version choice made here. Anyone re-running install from a clean checkout needs the same flag; called out in `README.md` and `FEATURE_PROGRESS.md` Feature 01.
- No external API keys configured — not needed until Phase 6 (LLM) / Phase 7 (TTS); STT (Deepgram) is now implemented behind the provider interface but also unverified without a key — mock providers cover the happy path until then (`architecture.md` §S).
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

## Decisions log (Phase 4 additions)

| Date | Decision | Why |
|---|---|---|
| 2026-09-13 | `transcript.partial`/`transcript.final` are both server → client events, not client → server as PRD.md §9 literally lists (and as `transcript.final` had shipped in Feature 06) | Doesn't match this project's own committed architecture (§E/§H): the client streams raw mic audio, the backend's STT provider produces both partial and final segments. Caught while implementing the first feature to actually use these events; documented per CLAUDE.md's "do not silently change requirements" rule rather than left inconsistent |
| 2026-09-13 | `MockSTTProvider` accepts real audio chunks but does not fabricate transcript text from them | Inventing plausible-sounding transcript text from silence/noise would be dishonest, uncontrolled behavior no downstream consumer (rubric, LLM) should ever evaluate against — `dev.simulate_transcript` already exists as the real "test without a provider key" path, so mock STT doesn't need to also do it |
| 2026-09-13 | STT provider start failure is caught and the session still starts (with `stt_session = None`), rather than failing `session.start` | architecture.md §H explicitly requires degrading gracefully on STT failure instead of killing the interview session — mic/code/hints should all keep working even if transcription is unavailable |

## Decisions log (Phase 5 additions)

| Date | Decision | Why |
|---|---|---|
| 2026-09-13 | `review` is reachable from every interview stage, not just the coding/complexity/testing/optimisation loop | architecture.md §I's arrow diagram (`intro → clarification → approach → coding ⇄ ...`) doesn't literally show early exits, but a real candidate can end the interview at any point and `session.end` must always be able to reach the terminal stage — a considered interpretation, not a literal reading |
| 2026-09-13 | `hint_level` increments uncapped on every `hint.requested`; the level-3 refusal rule from §L rule 6 is deliberately not enforced here | That's the controller's job (Feature 08), not the state machine's — Feature 07 keeps the count correct, Feature 08 decides what to do with it |
| 2026-09-13 | "controller can trigger interviewer actions" left unchecked in Feature 07 rather than stubbed with a placeholder controller | architecture.md §L itself scopes the controller as "folded into Features 07/08" — building a fake one now just to satisfy the checkbox would be scope creep in the wrong direction |

## Milestone table

Mirrors `FEATURE_PROGRESS.md`; see that file for full acceptance criteria and checkpoint detail.

| # | Feature | Status | Priority |
|---|---|---|---|
| 01 | Repository and project foundation | DONE | P0 |
| 02 | Interview overlay UI (mocked data) | DONE | P0 |
| 03 | LeetCode problem detection | DONE | P0 |
| 04 | Live code extraction and change detection | DONE | P0 |
| 05 | Microphone and speech-to-text | VERIFIED | P0 |
| 06 | Interview WebSocket session | VERIFIED | P0 |
| 07 | Interview state machine | VERIFIED | P0 |
| 08 | AI interviewer | PLANNED | P0 |
| 09 | Code analysis | PLANNED | P1 |
| 10 | ElevenLabs interviewer voice | PLANNED | P0 |
| 11 | Tiered hints | PLANNED | P1 |
| 12 | Screen/tab recording | PLANNED | P1 |
| 13 | Live rubric | PLANNED | P1 |
| 14 | End interview and review | PLANNED | P0 |
| 15 | Persistence | PLANNED | P1 |
| 16 | Integration hardening and demo readiness | PLANNED | P0 |
