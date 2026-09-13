# progress.md

High-level project dashboard. Update after every meaningful work slice, per `CLAUDE.md`. This file answers: where are we, what's next, what's blocking.

---

## Status: all 16 features at least VERIFIED — only a human demo rehearsal remains before MVP is DONE

Last updated: 2026-09-13

> **Feature 16 (integration hardening + demo readiness) is now `VERIFIED`** (not `DONE` — the two things left are inherently things only a human can do: a real click-through rehearsal and a latency/feel judgement). Everything checkable from this environment was done directly (not blind-dispatched — this feature needs judgement calls, not just parallelizable slices), with two agents doing disjoint audit/docs work in parallel alongside it:
>
> - **Real happy-path integration test**: a new chained backend test drives the actual client-event sequence (start → code_update → question → cooldown-blocked retrigger → code_update → different question → hint → rubric-carrying code_update → end → review) through the real WS handler with a monkeypatched clock, so the 30s interviewer cooldown is genuinely enforced across the whole session rather than each piece being tested in isolation with fresh state.
> - **Closed real gaps found by auditing docs against code**: mic denial previously only showed a "MIC BLOCKED" badge while letting the interview proceed anyway — contradicting PRD §14 ("prevent starting the interview if audio is essential") and architecture.md's own claim of a `PermissionGate.tsx` component that never actually existed. `useMicrophoneCapture`'s `start()` now resolves the real outcome and `InterviewPanel`/`StartScreen` block with a clear message + "Try Again" on denial. Also closed: no automated test existed for the STT *send*-failure path (as opposed to the already-tested connection-*start*-failure path), and no persistence-write-failure test existed (only the success-path call-count test). Both added.
> - **A secret-tripwire check that architecture.md §U had promised existed since Phase 1 but never did**: `scripts/check.sh` now greps the built extension bundle for every backend-only secret variable name and fails the check if any leak through — directly closes a PRD §16 Definition-of-Done item.
> - **Stale docs fixed**: README's "Project status" section still described Phase 1 ("no AI/speech/backend wiring exists yet") despite the whole MVP pipeline being built — rewritten to match reality. `architecture.md` §V's error-handling table was audited row-by-row against actual code; several rows quoted UI strings or mechanisms (a nonexistent component, an oversimplified STT-failure story) that didn't match what was actually built — all corrected.
> - **`DEMO.md` written** — a full rehearsal runbook (setup + provider priority, the click-through with judge call-outs, known rough edges to route around live, a pre-flight checklist) — but the actual human rehearsal following it is still open.
> - **Build reproducibility verified for real**: a fresh `.venv` (backend) and fresh `node_modules` (extension) from a clean checkout both pass the full test/lint/typecheck/build pipeline.
> - Full suites: **backend 197/197 pytest + ruff clean; extension 113/113 vitest + typecheck/lint/build clean.**
>
> **Every one of the 16 features is now at least `VERIFIED`.** The MVP's remaining work is entirely the live/manual pass: follow `DEMO.md` in a real browser with a real mic (ideally real Anthropic/ElevenLabs/Deepgram keys), judge whether it feels conversational, fix whatever actually breaks — at which point Feature 16 and every other `VERIFIED`-not-`DONE` feature (05/08/10/11/12/13/14/15) can flip to `DONE` together.
>
> **Previously:** Features 12 (screen/tab recording) and 15 (persistence) implemented and `VERIFIED` as disjoint parallel slices. Feature 14 (final review) implemented and `VERIFIED` — evidence-grounded `FinalReview`/`ReviewPoint`/`EvidenceItem` contract, schema-enforced citation resolution on both Pydantic and Zod sides. Features 09/11/13 (code analysis, tiered hints, evidence-based rubric) and Feature 10 (ElevenLabs TTS) implemented and `VERIFIED`. Transport blocker resolved (leetcode.com's CSP — the WebSocket moved into the service worker, `architecture.md` §B.1), and real Deepgram transcription verified live. Features 05 and 06 are both `DONE`. A privacy defect (mic kept recording after teardown) was found and fixed, verified empirically (`architecture.md` §B.2).

## Current phase

**Phase 6 — AI interviewer + controller, complete, plus the UI wiring that naturally follows it.** Feature 08 is `VERIFIED`: an LLM provider interface (mock + Anthropic, same mock-by-default pattern as STT), an interviewer agent that condenses `InterviewState` into versioned prompts, and `interview/controller.py` enforcing architecture.md §L's deterministic gating rules (cooldown, candidate-speaking gate, duplicate-question rejection, hint cap, legal-transitions-only). Wired into the WS session so `code.update`/transcript-final/`hint.requested` now genuinely trigger the interviewer — verified end-to-end through the mock provider via real ASGI-level WebSocket tests. This closes Feature 07's last acceptance criterion, so that feature is now `DONE`.

TODO.md's Phase 6 scope was backend-only, and the extension's transcript panel was still on the Feature 02 mock engine when that landed — the user asked directly why their input wasn't showing up (a correct read of that exact gap) and, given the go-ahead, it's now wired for real: `state/liveInterviewEngine.ts` consumes `interviewer.transcript`/`hint.response`/`transcript.final` into the same transcript UI, `content/interviewSession.ts` moves `session.start` from automatic-on-page-load to the Start button click (fixing a real race that would have silently dropped an early interviewer reply), and the Hint button now sends a real `hint.requested`. The final Review screen's strengths/areas/timeline are still `mockEngine.ts`'s old hardcoded placeholder (Feature 14's job) — left as a visible, documented inconsistency rather than silently patched over.

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
- **Phase 6 (Feature 08):**
  - `backend/app/interview/actions.py` — `InterviewerAction`, the single typed structure every provider must return (forced via tool-use for the real provider, never free-text parsing).
  - `backend/app/interview/prompts.py` — versioned (`PROMPT_VERSION`), stage-specific system/user prompt builders; the user prompt's first two lines are a documented `Stage:`/`Trigger:` marker contract the mock provider relies on.
  - `backend/app/providers/llm/{base,mock,anthropic}.py` — same mock-by-default pattern as STT; `MockLLMProvider` gives deterministic per-stage canned responses so the whole pipeline is testable without a key; `AnthropicLLMProvider` forces structured tool-use output, implemented but unverified live (no key).
  - `backend/app/agents/interviewer.py` — thin: condenses state into prompts, asks the provider, returns the proposal.
  - `backend/app/interview/controller.py` — `InterviewController`, the deterministic gate (§L rules 1,2,4,5,6). Rule 3 (debounce code-triggered calls) deliberately *not* re-implemented server-side — the client already debounces every `code.update` before sending it (Feature 04), so duplicating that logic server-side would just be redundant; the cooldown rule already caps how often the interviewer actually speaks regardless.
  - `backend/app/websocket/interview.py` — new `_maybe_speak()` wired into `code.update`, transcript-final (both mock and real STT paths), and `hint.requested`. Refined Feature 07's hint handling: `hint_level` now only increments when a `give_hint` proposal is actually *accepted*, not unconditionally on every request — the cap has real enforcement to sit behind now.
  - This closes Feature 07's last acceptance criterion ("controller can trigger interviewer actions") — that feature is now `DONE`.
- **Phase 6 addendum — extension transcript wired to real events (explicitly requested after Feature 08 landed):**
  - `extension/src/state/liveInterviewEngine.ts` (new) — consumes `interviewer.transcript`/`hint.response`/`transcript.final` into the same reducer/`Transcript` UI the mock engine used to drive. `transcript.partial` (mid-speech) intentionally not rendered — no "update in place" concept for a transcript message, appending one per partial would spam duplicates.
  - `extension/src/state/mockEngine.ts` — trimmed to just `buildMockReview`; the scripted dialogue timeline and canned hint cycling were deleted (dead code once real events do that job), not left unused.
  - `extension/src/content/interviewSession.ts` (new) — moves `session.start` from automatic (Feature 06's original design) to the Start button click. **Real bug caught while doing this**: LeetCode loads with boilerplate code already in the editor, and the code-change detector always emits on the first-ever settle — so a `code.update` (and a possible interviewer reply) could arrive within ~3s of page load, before Start was ever clicked, and get silently wiped the moment it was (`session/start` resets `state.messages`). Gating both on the same click removes the race.
  - `InterviewPanel.tsx` — Hint button now sends real `hint.requested`; End sends `session.end`. Review screen's strengths/areas/timeline intentionally left as `mockEngine.ts`'s old placeholder (Feature 14's job) — a visible, documented inconsistency rather than a silently patched one.
  - 12 new tests (`interviewSession.test.ts`, `liveInterviewEngine.test.ts`); live Chrome regression: Start → hint → End & review → Restart, clean throughout, rubric now honestly all-zero instead of the old scripted partial numbers.

- **Transport fix (2026-09-13) — service-worker WebSocket relay:**
  - `extension/src/networking/portSocket.ts` (new) — a `WebSocketLike` that proxies to the service worker over a `chrome.runtime` port. Drops into the `WebSocketFactory` seam that already existed for tests, so `networking/websocket.ts` (reconnect/backoff/resume state machine) is completely untouched and its 7 unit tests still pass unmodified.
  - `extension/src/background/index.ts` — no longer a stub; owns the real WebSocket and relays frames both directions. Holds **no session state**, honouring §B's original eviction concern: when the worker is evicted the port drops, the content script sees an ordinary `close`, and its existing backoff opens a fresh port which wakes the worker and replays `session.resume`.
  - `extension/src/manifest.ts` — `http://127.0.0.1:8000/*` + `http://localhost:8000/*` host permissions. Necessary (the worker's socket needs them) but *not* the fix; confirmed granted and active while the content script still failed.
  - Accepted cost: ports are JSON-only, so mic chunks are base64'd across (~33% overhead on ~4.8KB every 250ms). Verified working live rather than assumed.
  - Diagnosis method worth reusing: Chrome's own error was unreachable (the console tool doesn't surface content-script messages — hit in two consecutive sessions) and every in-page probe is confounded because page CSP is evaluated first. Making the *backend* the observer (`uvicorn --log-level debug`, "did any attempt arrive?") split client-block from server-reject in one shot; a service-worker probe then isolated the variable.

- **Real STT + privacy hardening (2026-09-13):**
  - First live run against a real `DEEPGRAM_API_KEY` produced accurate transcripts (5 finals, 6 partials, zero errors) and surfaced three defects no automated test could have caught — a missing WebM container header (chunks were dropped before the session existed, and only chunk #1 carries the header), an unguarded STT send that turned a Deepgram close into an infinite crash-reconnect loop, and the microphone privacy defect below.
  - **PRIVACY:** the mic outlived the panel because `content/index.tsx` removed the React host without calling `root.unmount()`, so no effect cleanup ran. Fixed at the root plus five further layers of defence, since the failure is silent — no error, no log, just a live mic with no indicator. Recorded in `architecture.md` §B.2, which teardown paths must re-check.
  - Audio buffered before a session is now discarded at both session boundaries and on socket close, so audio captured in one window can never be flushed into another.
  - `backend/tests/conftest.py` forces mock providers: `Settings` reads `backend/.env` and pytest runs from `backend/`, so a real key made three tests open billable connections to the live API.
  - Every regression test in this batch was verified to **fail** against the pre-fix code — a guardrail that cannot fail is not a guardrail.

## In progress

Nothing blocking. Feature 08 remains `VERIFIED` rather than `DONE` only for want of an `ANTHROPIC_API_KEY` — the interviewer loop is proven live through `MockLLMProvider`, but `AnthropicLLMProvider`'s forced tool-use path is unexercised against the real API.

## Next

**Phase 7 (Feature 10) — ElevenLabs TTS.** Server-side ElevenLabs integration, streaming synthesized audio back over the WS connection for `interviewer.transcript`/`hint.response` text, plus candidate mute control. Per `TODO.md`. Note the return path now terminates in the service worker, so audio coming *back* has to cross the same `chrome.runtime` port — binary the other direction, which `portSocket.ts` does not yet handle (it only forwards text frames worker→content script, since the backend previously only sent JSON). That is the first thing Phase 7 will need to extend; see `architecture.md` §B.1.

Worth doing whenever keys become available: exercise the real Deepgram and Anthropic providers, which would let Features 05 and 08 flip to `DONE`.

## Known issues / blockers

- **FIXED 2026-09-13 — PRIVACY: the microphone kept recording after the panel was torn down.** On a LeetCode SPA navigation the panel reset to `NOT STARTED` while the mic kept capturing and streaming (measured: 14 further audio frames in ~10s, transcripts still arriving). Root cause: `content/index.tsx`'s `unmount()` removed the React host from the DOM but never called `root.unmount()`, so no effect cleanup ran and the `MediaRecorder` outlived its component; `mount()` then created a second root, orphaning another recorder per navigation. Fixed with layered defences (React root now actually unmounted, hook cleanup, async-race generation guard, double-start guard, module-level single-capture invariant + `stopAllMicrophoneCapture()` kill switch, idempotent stop with post-stop chunk suppression). Full record in `architecture.md` §B.2. Regression tests added, and the unmount test was verified to fail against the pre-fix code.
- **Reconnects lose transcription for the rest of the interview.** The backend only creates an STT session on `session.start`, not on `session.resume`, and by then the recorder is mid-stream so a fresh Deepgram connection would get headerless audio and close. The interview itself survives (the STT guard keeps it alive), but nothing transcribes after a drop. Fix: restart `MediaRecorder` on reconnect so each STT session receives a self-contained WebM stream, and recreate the STT session on resume. Not attempted yet — deliberately not half-built.

- `npm install` at the workspace root requires `--legacy-peer-deps` — a known npm/arborist resolver crash (`Cannot read properties of null (reading 'edgesOut')`) triggered by vitest's optional browser-mode peer packages, unrelated to any version choice made here. Anyone re-running install from a clean checkout needs the same flag; called out in `README.md` and `FEATURE_PROGRESS.md` Feature 01.
- No external API keys configured. STT (Deepgram), interviewer LLM (Anthropic) and — from Phase 7 — TTS (ElevenLabs) are all implemented behind provider interfaces but unverified without real keys; mock providers cover the happy path (`architecture.md` §S).
- **The browser console tool does not reliably surface content-script-origin messages.** Hit in two consecutive sessions, and it actively cost time during the transport diagnosis — Chrome's own `WebSocket connection failed` / CSP error was never readable through it. When debugging extension networking, instrument the *backend* or use a service-worker probe instead of trusting console capture.
- ~~Extension can't connect to a live backend~~ — **RESOLVED 2026-09-13**, see the banner at the top. Both earlier partial fixes (the `127.0.0.1` pin and the backend host permissions) are retained deliberately; neither was the root cause but both were real and are still required.
- ~~`claude-in-chrome` can't reach `localhost:8000`~~ — did not reproduce this session; the automated browser reached the backend fine and was used for the full live verification.
- A `uvicorn` process with debug logging is running on port 8000 from this session (started by Claude, logging to the session scratchpad). Stop it with `pkill -f "uvicorn app.main:app"` if it's in the way.

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

## Decisions log (Phase 6 additions)

| Date | Decision | Why |
|---|---|---|
| 2026-09-13 | `hint_level` now increments only inside `InterviewController.accept_proposal` when a `give_hint` action is actually accepted, superseding Feature 07's "increment unconditionally on hint.requested" | The cap (§L rule 6) needed a single source of truth to enforce against, and an LLM could in principle propose `give_hint` from a different trigger too, not only an explicit request |
| 2026-09-13 | §L rule 3 (debounce code-triggered LLM calls) is not re-implemented server-side | The client already debounces every `code.update` before sending it (Feature 04's `codeChangeDetector.ts`) — duplicating that logic server-side would re-solve an already-solved problem; the cooldown rule (rule 2) already caps how often the interviewer actually speaks regardless of update frequency |
| 2026-09-13 | `LLMProvider.propose_action` takes pre-built prompt strings, not `InterviewState` directly; prompt construction lives in `agents/interviewer.py` + `interview/prompts.py`, not in the provider | Keeps the provider layer a reusable, interview-agnostic "text in, structured action out" transport, matching how `providers/stt` was kept close to raw audio bytes rather than full interview semantics |
| 2026-09-13 | Extension transcript panel initially left wired to the mock engine only — **superseded same day**: user asked why their input wasn't appearing, confirmed the gap was exactly what was flagged, and asked for it to be wired; now driven by real events via `state/liveInterviewEngine.ts` | TODO.md's actual Phase 6 scope was backend-only, so it wasn't assumed without being asked — but once asked, it was a natural, well-scoped follow-up rather than a new feature |
| 2026-09-13 | `session.start` moved from firing automatically once the problem is detected to firing on the Start button click | Caught while wiring the transcript: LeetCode's boilerplate starter code can trigger a `code.update` (and a real interviewer reply) within seconds of page load, before the candidate ever clicks Start — under the old design that reply would be silently wiped the moment they did, since `session/start`'s reducer resets `state.messages` |
| 2026-09-13 | Extension's default backend URL pins the literal IPv4 address `ws://127.0.0.1:8000/...` instead of `ws://localhost:8000/...` | macOS resolves `localhost` to IPv6 `::1` first, but `uvicorn --host 0.0.0.0` binds IPv4 only — Chrome's WebSocket therefore connects to a dead address and fails forever, while `curl localhost:8000` appears fine because curl falls back to IPv4 itself. Pinning the literal address removes the ambiguity. Commented in-place in both `interviewSocket.ts` and `extension/.env.example` so it doesn't get "tidied" back |

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
| 07 | Interview state machine | DONE | P0 |
| 08 | AI interviewer | VERIFIED | P0 |
| 09 | Code analysis | PLANNED | P1 |
| 10 | ElevenLabs interviewer voice | PLANNED | P0 |
| 11 | Tiered hints | PLANNED | P1 |
| 12 | Screen/tab recording | PLANNED | P1 |
| 13 | Live rubric | PLANNED | P1 |
| 14 | End interview and review | PLANNED | P0 |
| 15 | Persistence | PLANNED | P1 |
| 16 | Integration hardening and demo readiness | PLANNED | P0 |
| 17 | Resizable interview panel | IMPLEMENTED | P2 |

## Decisions log (Phase 6 addendum / transport fix)

| Date | Decision | Why |
|---|---|---|
| 2026-09-13 | The background service worker owns the WebSocket; the content script talks to it over a `chrome.runtime` port — **reverses** `architecture.md` §B's "content script owns the WS connection" | Forced, not preferred: leetcode.com's `default-src 'none'; connect-src 'self' https://challenges.cloudflare.com` CSP blocks any page-context connection to the local backend, verified by zero inbound attempts reaching a debug-logging backend during a full page load, while a service-worker probe connected first try from the same build. §B's original eviction concern is preserved by keeping all session state in the content script and making the worker a stateless pipe. Full record in `architecture.md` §B.1 |
| 2026-09-13 | Mic audio is base64-encoded across the runtime port rather than moving capture into an offscreen document | `chrome.runtime` ports are JSON-only. ~33% overhead on a ~4.8KB chunk every 250ms is acceptable and was verified working live; an offscreen document is a larger change that shouldn't be made speculatively. Documented as the escape hatch if it ever bites |
| 2026-09-13 | Panel width became resizable (drag handle, like Chrome's built-in side panel), clamped to 320–min(720, 60vw)px and persisted via `chrome.storage.local`, superseding the fixed 420px from Feature 02 | User request, out of `FEATURE_PROGRESS.md`'s original sequencing (added as Feature 17, P2) — bounded change to the existing panel/layout code, not a new subsystem, so no architecture.md update was needed |
