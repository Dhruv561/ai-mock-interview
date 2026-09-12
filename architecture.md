# architecture.md

Living technical design for the AI Mock Interview Chrome extension. This document is written against the **actual state of the repository** (inspected 2026-09-12: only `PRD.md`, `CLAUDE.md`, `FEATURE_PROGRESS.md`, `docs/ui-reference.png` exist — no code, no scaffolding). Nothing here is copied blindly from `PRD.md` §6–8; where a decision was made or narrowed, the reasoning is recorded.

Environment confirmed locally: Node v23.11.0 / npm 10.9.2, Python 3.14.7, `uv` installed (no `poetry`).

Update this file whenever a meaningful architectural decision is made or reversed. Do not let it drift from what is actually implemented — if reality and this doc disagree, fix the doc in the same commit that changes the code.

---

## 1. Guiding decisions and deviations from PRD.md

The PRD leaves technology choices open in several places ("an LLM API suitable for...", "a streaming speech-to-text provider"). Per `CLAUDE.md`, the simplest option that gives the best hackathon demo was chosen in each case:

| Area | Decision | Reasoning |
|---|---|---|
| Interviewer/evaluator LLM | Anthropic Claude (Messages API, Sonnet-class model), via a `LLMProvider` interface | Structured JSON output via tool-use is reliable; provider is swappable and mockable |
| Streaming STT | Deepgram (Nova streaming websocket API) | Native streaming, accepts WebM/Opus directly (matches `MediaRecorder` output with zero client-side transcoding), simple to mock |
| TTS | ElevenLabs (mandated by PRD) | streaming endpoint, audio relayed to extension over the existing WebSocket |
| Database | Postgres (Supabase in prod, local Postgres or pure in-memory in dev) behind a `SessionRepository` interface | Keeps a single relational dependency; JSONB columns avoid an over-normalized schema for a hackathon |
| Extension media capture | `getUserMedia` (mic) and `getDisplayMedia` (screen/tab) called **directly from the content script**, not `chrome.tabCapture` | `chrome.tabCapture` requires an extension page + awkward activeTab flows in MV3; standard Web APIs triggered by a user gesture on the injected panel are simpler and match "explicit permission" UX requirement (NFR3) |
| Extension architecture | Content script owns UI, media capture, and the WebSocket connection. Background service worker is minimal (install lifecycle + icon-click toggle only) | MV3 service workers are killed and restarted arbitrarily; keeping session-critical state (open mic stream, open socket) in a component that lives as long as the tab avoids reconnect storms |
| Extension state management | React `Context` + `useReducer`, no external store library | CLAUDE.md: avoid unnecessary state-management dependencies. The event stream from the backend maps directly onto reducer actions — a purpose-built fit, no library needed |
| Shared client/server schema | Hand-maintained: Pydantic models are the source of truth on the backend, TypeScript types + Zod schemas are hand-mirrored in `shared/` | A codegen pipeline (e.g. `datamodel-code-generator`) is more infrastructure than an MVP with ~15 event types needs. Documented as a deliberate simplification — see §R (testing) for how drift is caught |
| Code static analysis | Python `ast` module only, for Python submissions. Other languages get LLM-only analysis, no static parser | Writing multi-language static analyzers is out of scope for a hackathon; Python is the default/demo language on LeetCode |
| Monorepo tooling | npm workspaces for `extension/` + `shared/`; `backend/` is a separate `uv`-managed Python project at the repo root, invoked by `scripts/dev.sh` | No need for Turborepo/Nx at this scale; two ecosystems (npm, uv) coexist fine as sibling directories |

---

## 2. Repository layout (target)

This is the structure Phase 1 onward will create. Nothing below exists yet except `docs/`.

```text
ai-mock-interview/
├── README.md
├── PRD.md
├── CLAUDE.md
├── progress.md
├── architecture.md
├── TODO.md
├── .env.example
├── .gitignore
│
├── extension/
│   ├── package.json
│   ├── vite.config.ts              # @crxjs/vite-plugin + @vitejs/plugin-react
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── public/icons/
│   └── src/
│       ├── manifest.ts             # MV3 manifest via crxjs
│       ├── background/
│       │   └── index.ts            # minimal service worker
│       ├── content/
│       │   ├── index.tsx           # mounts React root into a shadow DOM
│       │   ├── leetcode.ts         # problem detection + DOM extraction fallback
│       │   ├── editor.ts           # Monaco adapter (isolated-world side)
│       │   └── mainWorldBridge.ts  # injected MAIN-world script for monaco access
│       ├── components/
│       │   ├── InterviewPanel.tsx
│       │   ├── StatusIndicator.tsx
│       │   ├── Transcript.tsx
│       │   ├── Rubric.tsx
│       │   ├── HintButton.tsx
│       │   ├── PermissionGate.tsx
│       │   └── Review.tsx
│       ├── state/
│       │   ├── interviewStore.tsx  # Context + reducer
│       │   └── types.ts
│       ├── media/
│       │   ├── microphone.ts
│       │   └── screen.ts
│       ├── networking/
│       │   └── websocket.ts        # reconnect + seq tracking
│       └── styles/
│           └── globals.css         # Tailwind entry
│
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py                # env var loading, pydantic Settings
│   │   ├── api/routes.py            # health check, non-WS REST (if any)
│   │   ├── websocket/interview.py   # WS endpoint, session lifecycle
│   │   ├── interview/
│   │   │   ├── state.py             # InterviewState model + FSM
│   │   │   ├── controller.py        # deterministic gating logic
│   │   │   ├── prompts.py           # versioned prompt templates
│   │   │   └── schemas.py           # pydantic event models (source of truth)
│   │   ├── agents/
│   │   │   ├── interviewer.py
│   │   │   ├── code_analyser.py
│   │   │   └── evaluator.py
│   │   ├── providers/
│   │   │   ├── llm/{anthropic.py,mock.py,base.py}
│   │   │   ├── stt/{deepgram.py,mock.py,base.py}
│   │   │   └── tts/{elevenlabs.py,mock.py,base.py}
│   │   ├── leetcode/parser.py       # server-side problem normalisation helpers
│   │   ├── persistence/
│   │   │   ├── database.py
│   │   │   ├── repository.py        # SessionRepository interface
│   │   │   ├── in_memory.py
│   │   │   └── postgres.py
│   │   └── services/events.py       # event bus / dispatch helpers
│   └── tests/
│
├── shared/
│   ├── events.ts                    # Zod schemas + inferred TS types (hand-mirrored)
│   └── README.md                    # sync policy with backend/app/interview/schemas.py
│
├── scripts/
│   ├── dev.sh                       # runs backend (uv) + extension (npm) concurrently
│   └── check.sh                     # lint/type/test across both projects
│
└── docs/
    ├── ui-reference.png             # (exists)
    ├── design.md
    └── demo.md
```

---

## 3. Subsystem specifications

Each subsystem below states responsibility, files, inputs/outputs, dependencies, testing strategy, risks, and definition of done, per the planning brief.

### A. Repository architecture

- **Responsibility:** house extension, backend, and shared contracts as siblings with independent toolchains but one coherent dev workflow.
- **Files/modules:** repo root configs (`.gitignore`, `.env.example`), `scripts/dev.sh`, `scripts/check.sh`.
- **Inputs:** none (structural).
- **Outputs:** a buildable/runnable skeleton for both sub-projects.
- **Dependencies:** Node 20+/npm, Python 3.11+ (3.14 available locally) via `uv`.
- **Testing strategy:** `scripts/check.sh` runs `npm run lint && npm run build` in `extension/`, `uv run pytest` and `uv run ruff check` in `backend/`.
- **Risks:** two toolchains drifting out of sync; mitigated by a single `scripts/dev.sh` and documented setup in README.
- **Done when:** fresh clone → `scripts/dev.sh` boots both processes with mock providers, no manual steps beyond `.env` copy.

### B. Chrome extension architecture

- **Responsibility:** MV3 packaging, permissions, lifecycle; inject the interview experience into LeetCode problem pages.
- **Files:** `extension/src/manifest.ts`, `extension/src/background/index.ts`, `extension/src/content/index.tsx`.
- **Inputs:** browser events (tab navigation, icon click).
- **Outputs:** injected content script + mounted React panel.
- **Dependencies:** `@crxjs/vite-plugin`, Manifest V3, `host_permissions: ["https://leetcode.com/*"]`, `permissions: ["scripting", "storage"]` (no `tabCapture`, no manifest mic permission — those are page-origin Web API permissions, not extension permissions).
- **Testing strategy:** manual load-unpacked smoke test; a small vitest unit test for the content-script boot guard (only mounts once per page, only on `/problems/*`).
- **Risks:** MV3 service worker eviction — mitigated by keeping the WS connection and media streams in the content script, not the background worker. Content-script re-injection on SPA navigation (LeetCode is a SPA) needs a `history.pushState` / `MutationObserver` watch, not just `document_idle` injection.
- **Done when:** extension loads unpacked, panel mounts on a real `leetcode.com/problems/<slug>` page, and survives an in-app SPA navigation between two problems without a full page reload.

### C. React UI architecture

- **Responsibility:** render the interview panel per the visual reference, driven entirely by a typed store.
- **Files:** `extension/src/components/*`, `extension/src/state/interviewStore.tsx`.
- **Inputs:** typed backend events (via reducer actions), user actions (hint click, end click).
- **Outputs:** rendered DOM inside a shadow root (style isolation from LeetCode's own CSS).
- **Dependencies:** React 18, Tailwind CSS, no external state library.
- **Testing strategy:** vitest + React Testing Library — reducer transition tests (pure functions, easy to test exhaustively), component render tests using mocked store state (recording indicator states, rubric bar widths, transcript ordering).
- **Risks:** shadow-DOM + Tailwind interaction (Tailwind's injected `<style>` must be placed inside the shadow root, not `document.head`). Tested manually in Phase 1.
- **Page layout (added after first manual review, 2026-09-12):** the panel does not float over LeetCode's editor. `extension/src/content/layout.ts` reserves `PANEL_WIDTH_PX` (420px) on the right edge of the viewport by setting `margin-right` (`!important`) on `<html>` while the panel is mounted, so LeetCode's own fluid layout shrinks to fit beside it — the same technique other docked-sidebar extensions (e.g. Grammarly) use. This also shifts the containing block for LeetCode's own `position: fixed` elements, so they don't stay pinned underneath the panel. Verified manually against a real `leetcode.com/problems/two-sum` page.
- **Done when:** Phase 1 acceptance criteria in `FEATURE_PROGRESS.md` Feature 02 are all met using mocked interview data, no backend required.

### D. LeetCode problem/code extraction strategy

- **Responsibility:** identify a supported problem page, extract problem metadata, and read the live editor contents.
- **Files:** `extension/src/content/leetcode.ts`, `extension/src/content/editor.ts`, `extension/src/content/mainWorldBridge.ts`.
- **Inputs:** live DOM of `leetcode.com/problems/<slug>`.
- **Outputs:** `ProblemInfo {title, slug, difficulty, description, language}`, `getCurrentCode(): string`.
- **Dependencies:** none external; LeetCode's Monaco editor instance.
- **Testing strategy:** manual verification against 2–3 real problems (varying description length, varying starter code); no meaningful way to unit-test live DOM shape — documented as a manual-verification-only subsystem.
- **Risks:** content scripts run in an isolated JS world and cannot see `window.monaco` directly. Mitigation: inject a small script into the page's MAIN world (`chrome.scripting.executeScript({world: "MAIN"}, ...)`) that reads `monaco.editor.getModels()[0].getValue()` and posts it back via `window.postMessage`. Fall back to scraping `.view-lines` DOM text (less reliable — Monaco virtualizes long files) if the Monaco global isn't found within a timeout. LeetCode selector/DOM changes break this subsystem silently — isolate it behind the adapter so only this file needs fixing.
- **Done when:** problem metadata and live code are both extractable and demoed against the merge-intervals-style problem from the UI reference.

### E. Microphone/audio capture

- **Responsibility:** capture candidate speech, chunk it, stream to backend.
- **Files:** `extension/src/media/microphone.ts`.
- **Inputs:** `getUserMedia({audio: true})` stream.
- **Outputs:** `MediaRecorder` chunks (WebM/Opus, ~250ms) sent as binary WS frames.
- **Dependencies:** browser `MediaRecorder` API, WebSocket connection (§G) must be open first.
- **Testing strategy:** manual — no reliable way to unit test real mic capture; a mock `AudioSource` (replays a fixture WebM file) is used in dev/testing to exercise the pipeline without real hardware.
- **Risks:** permission denial must degrade gracefully (§V). Chunk cadence vs STT latency tradeoff — 250ms chosen as a starting point, tunable.
- **Done when:** speaking into the mic produces `transcript.partial`/`transcript.final` events end-to-end with a real STT provider.

### F. Screen/tab recording

- **Responsibility:** optional screen/tab capture as a recording artefact and secondary multimodal signal — never the primary code-understanding source (CLAUDE.md §6).
- **Files:** `extension/src/media/screen.ts`.
- **Inputs:** `getDisplayMedia()` triggered by the "Start Interview" click (user gesture requirement).
- **Outputs:** local `MediaRecorder` Blob, uploaded to the backend once (or in coarse chunks) after the interview ends rather than live-streamed — reduces bandwidth and complexity, matches "recording artefact" framing.
- **Dependencies:** none beyond the Web API; requires the candidate to grant screen-share permission.
- **Testing strategy:** manual only.
- **Risks:** permission denial must not block the interview (FR4/§V — mic + code extraction are sufficient to run a session). Storage of video is out of scope for MVP beyond "can be stored" — Phase 10.
- **Done when:** recording can start/stop with a visible indicator and denial degrades gracefully; actual persistence of the video artefact is explicitly deferred to Phase 10/12 and tracked separately from the MVP happy path.

### G. Real-time WebSocket protocol

- **Responsibility:** single bidirectional channel per interview session carrying typed JSON control events and binary audio frames.
- **Files:** `extension/src/networking/websocket.ts` (client), `backend/app/websocket/interview.py` (server).
- **Inputs:** typed client events (§ event catalogue below), binary mic chunks.
- **Outputs:** typed server events, binary TTS audio chunks.
- **Dependencies:** FastAPI's native `WebSocket` support; no separate message broker.
- **Framing convention:** **text frames = JSON control events** (validated against Pydantic on the way in, Zod on the way out); **binary frames = raw audio bytes** (mic chunk WebM/Opus when sent by the client, TTS PCM/MP3 chunk when sent by the server) — direction and session state disambiguate which kind of audio a binary frame is; no custom header needed since a session only ever streams one audio kind at a time in each direction. Every event sent from server to client carries an incrementing `seq`.
- **Reconnect protocol:** client backs off exponentially (1s → 2s → 4s → … capped at 15s). On reconnect it sends `session.resume {session_id, last_seq}`. The backend keeps a per-session in-memory ring buffer of the last ~200 events for a grace window (~5 minutes after disconnect) and replays anything after `last_seq` before resuming live dispatch. This is a single-process, in-memory design — acceptable for a hackathon demo, documented as a scaling limitation (§Q).
- **Testing strategy:** backend contract tests — malformed/missing-field events rejected with a typed `error` event, not a crash; reconnect-and-replay integration test using two sequential WS client connections against one session.
- **Risks:** binary/text frame disambiguation is implicit — if this ever needs to carry two binary kinds in the same direction, revisit and add an explicit header. Not needed for MVP.
- **Done when:** Feature 06 acceptance criteria in `FEATURE_PROGRESS.md` are met, including malformed-event rejection and reconnect.

**Deliberate PRD deviation — transcript.partial/transcript.final direction:** PRD.md §9 lists both under "Client → backend events" and omits them from the server list entirely. That doesn't match this document's own §H, which was already clear that the *backend's STT provider* is what produces partial/final transcript segments from streamed mic audio — the client has no way to originate them itself once §E/§H's server-side-STT design is followed. Caught while implementing Feature 05 (the first feature to actually use these events); resolved by making both server → client, matching §H, not §G's original listing (which had copied the PRD's placement without checking it against §H). Documented here per CLAUDE.md's "do not silently change requirements" rule rather than fixed quietly.

**Client → backend event catalogue** (Pydantic models in `backend/app/interview/schemas.py`, mirrored in `shared/events.ts`):

```text
session.start          { problem: ProblemInfo, language: str }
session.pause
session.resume         { session_id: str, last_seq: int }
session.end
code.update             { language: str, code: str, timestamp: float }
screen.recording.started
screen.recording.stopped
hint.requested
dev.simulate_transcript { text: str }   # mock-mode only, rejected if USE_MOCK_PROVIDERS is false
```

Binary frames (raw mic audio chunks, see §E) flow on this same connection once a session exists — they're not part of the typed JSON catalogue, see the framing convention above.

**Backend → client event catalogue:**

```text
session.started         { session_id: str }
interviewer.state        { stage: InterviewStage }
interviewer.transcript   { text: str, seq: int }
interviewer.audio.start  { format: str }        # followed by binary frames, then...
interviewer.audio.end
transcript.partial       { text: str }
transcript.final          { text: str, timestamp: float }   # from the STT provider, see §H
rubric.updated           { rubric: RubricState, evidence: Evidence }
hint.response             { level: int, text: str }
review.ready              { review: FinalReview }
error                      { code: str, message: str, recoverable: bool }
```

### H. Streaming speech-to-text

- **Responsibility:** turn mic audio into partial + final transcript segments, distinguishing candidate speech (interviewer speech is synthesized text, not transcribed).
- **Files:** `backend/app/providers/stt/{base.py,deepgram.py,mock.py}`.
- **Inputs:** binary audio chunks relayed from the WS endpoint.
- **Outputs:** `transcript.partial` (best-effort, frequent) and `transcript.final` (segment boundary, e.g. on Deepgram's `speech_final`) events.
- **Dependencies:** Deepgram streaming websocket API (backend-to-Deepgram, key never touches the client).
- **Testing strategy:** provider interface tested against a recorded fixture via the mock provider; real Deepgram integration verified manually with actual speech.
- **Risks:** Deepgram connection failure mid-session — must degrade to "type to simulate" dev path or a visible "transcription unavailable" status without killing the session (§V).
- **Done when:** Feature 05 acceptance criteria met with a real provider connected.

### I. Interview state machine

- **Responsibility:** the single source of truth for interview progress; everything else reads/writes it, nothing bypasses it.
- **Files:** `backend/app/interview/state.py`.
- **Inputs:** events from the WS layer, controller decisions.
- **Outputs:** `InterviewState` (stage, problem, current code, transcript log, rubric, hint_level, timers, recent interviewer actions, code-analysis observations) — the object handed to the LLM and to the evaluator.
- **Dependencies:** none (pure Python/Pydantic).
- **Stages:** `intro → clarification → approach → coding ⇄ complexity ⇄ testing ⇄ optimisation → review`. Coding/complexity/testing/optimisation form a loop the controller can revisit (matches how real interviews go back and forth); `review` is terminal, entered only by `session.end`.
- **Testing strategy:** pure unit tests over the transition table — every legal transition succeeds, every illegal one is rejected with a typed error, no LLM/network involved.
- **Risks:** stage transitions driven by LLM proposals could thrash without a determinism check; the controller (§L), not the LLM, owns whether a proposed transition is accepted.
- **Done when:** Feature 07 acceptance criteria met, 100% branch coverage on the transition table.

### J. Interviewer LLM

- **Responsibility:** given the current `InterviewState`, propose the next interviewer action as structured output.
- **Files:** `backend/app/agents/interviewer.py`, `backend/app/interview/prompts.py`, `backend/app/providers/llm/{anthropic.py,mock.py}`.
- **Inputs:** condensed `InterviewState` (recent transcript window, current code, current stage, rubric, code-analysis summary, list of already-asked questions to avoid repetition).
- **Outputs:** structured JSON — `{action: "ask_question"|"remain_silent"|"transition_stage"|"give_hint", message?: str, stage_transition?: InterviewStage, rubric_updates?: {...}}` — validated against a Pydantic model before the controller acts on it.
- **Dependencies:** Anthropic Messages API with tool-use forced to the response schema (structured output, not free-text parsing).
- **Testing strategy:** prompt/schema tests using the mock provider (canned responses per stage); real-provider tests are manual/qualitative (LLM output isn't deterministic enough for strict assertions) — assert schema validity and controller-acceptance, not exact wording.
- **Risks:** LLM proposing an action the controller must reject (e.g. speaking mid-candidate-speech, revealing solution too early) — controller is the enforcement point, not the prompt (defense in depth, matches FR10).
- **Done when:** Feature 08 acceptance criteria met; interviewer produces a contextually relevant question referencing actual current code/transcript content in a live manual test.

### K. Code analysis

- **Responsibility:** deterministic-first static analysis of the candidate's code, feeding the interviewer without spending an LLM call on every keystroke.
- **Files:** `backend/app/agents/code_analyser.py`.
- **Inputs:** debounced `code.update` events (language + full source).
- **Outputs:** `CodeAnalysis {syntax_ok, complexity_estimate, suspicious_patterns[], matches_described_approach?}`.
- **Dependencies:** Python `ast` module for Python submissions (syntax check via `ast.parse`, naive Big-O heuristic via loop-nesting depth, obvious-bug heuristics like empty function bodies). Non-Python languages get an LLM-only pass with the same output shape (documented scope limitation).
- **Testing strategy:** unit tests over a fixture set of Python snippets (valid, syntax error, nested loops, single loop) asserting the heuristic outputs.
- **Risks:** heuristic complexity estimation is approximate by design — never presented to the candidate as authoritative, only as interviewer context.
- **Done when:** Feature 09 acceptance criteria met for Python; non-Python fallback documented and manually verified once.

### L. Interview controller

- **Responsibility:** the deterministic gate between "something happened" and "the interviewer speaks." Owns silence.
- **Files:** `backend/app/interview/controller.py`.
- **Inputs:** incoming events, LLM proposals (§J), code analysis (§K), current `InterviewState`.
- **Outputs:** a decision — remain silent, speak, hint, transition — that is actually executed.
- **Dependencies:** §I, §J, §K.
- **Rules enforced (deterministic, no LLM involved in the gate itself):**
  1. Never speak while `is_candidate_speaking` (derived from STT activity) is true.
  2. Minimum cooldown between interviewer utterances (e.g. 25–40s) unless a hint was explicitly requested.
  3. A code-update only triggers an LLM call after it has been both debounced (no edits for ~2.5s) and exceeds a minimum diff-size threshold — not every change.
  4. Track asked-question fingerprints to reject near-duplicate questions the LLM proposes.
  5. Stage transitions proposed by the LLM are only applied if legal per §I's transition table.
  6. Hints beyond level 3 are refused; revealing the full solution requires either level-3 exhaustion or an explicit interviewer-mode override (not present in MVP).
- **Testing strategy:** the highest-value test surface in the backend — pure unit tests over the gating rules with synthetic event sequences (rapid keystrokes → one LLM call; candidate mid-sentence → no interruption; repeated similar question → rejected).
- **Risks:** over-tuning cooldown/thresholds against demo conditions rather than real interview pacing — kept as named constants in one place for easy tuning during rehearsal.
- **Done when:** Feature 10-equivalent behaviour (folded into Features 07/08 acceptance criteria) is covered by the rule-based unit tests above, and a full manual run doesn't feel like "autocomplete commentary."

### M. ElevenLabs TTS

- **Responsibility:** synthesize interviewer text to speech, stream it to the extension, play it.
- **Files:** `backend/app/providers/tts/{elevenlabs.py,mock.py}`, playback handled client-side in `extension/src/networking/websocket.ts` (audio-frame handling) + a small `AudioContext` queue player.
- **Inputs:** interviewer message text.
- **Outputs:** `interviewer.audio.start` + binary chunks + `interviewer.audio.end`, played via Web Audio API as chunks arrive (not waiting for the full clip).
- **Dependencies:** ElevenLabs streaming TTS endpoint; key server-side only (NFR3/CLAUDE.md §7).
- **Testing strategy:** mock provider returns silence/no audio, exercising the text-first-audio-optional path; real provider verified manually for latency-to-first-audio.
- **Risks:** TTS failure must not block the interview — `interviewer.transcript` (text) is always sent, audio is additive. Playback interruption (candidate starts talking mid-utterance) should stop playback cleanly.
- **Done when:** Feature 10 acceptance criteria met, including a manual failure-path check (kill the ElevenLabs key, confirm text still appears and the session continues).

### N. Hint system

- **Responsibility:** tiered, controlled guidance.
- **Files:** `backend/app/interview/controller.py` (hint policy), `backend/app/interview/prompts.py` (per-level prompt).
- **Inputs:** `hint.requested` event, current hint level in `InterviewState`.
- **Outputs:** `hint.response {level, text}`; increments stored hint level; records evidence for the final review.
- **Dependencies:** §J (LLM call bounded by the requested level's prompt).
- **Testing strategy:** unit test the level-increment/cap logic and the "hint usage affects evidence" bookkeeping without needing a real LLM call.
- **Risks:** candidates spamming the hint button — capped at level 3, further requests return the same level-3 hint rather than escalating further.
- **Done when:** Feature 11 acceptance criteria met.

### O. Rubric scoring

- **Responsibility:** structured, evidence-linked live scoring across `clarifying / approach / code_quality / complexity / communication / testing`, each 0–3.
- **Files:** `backend/app/interview/state.py` (rubric sub-model), updates proposed by §J and applied by §L.
- **Inputs:** LLM-proposed `rubric_updates` accompanying an `ask_question`/`transition_stage` action.
- **Outputs:** `rubric.updated` events, each carrying an `evidence` pointer (transcript segment id, code snapshot id, or hint id) — never a bare number with no traceable cause (matches FR13/CLAUDE.md §10).
- **Dependencies:** §I, §L.
- **PRD deviation (product decision, 2026-09-12):** `rubric.updated` events are still computed and accumulated live on the backend exactly as FR13 specifies, but the extension UI deliberately does **not** render a live "RUBRIC SO FAR" section during the interview, contrary to PRD §3.3 and `docs/ui-reference.png`. Candidates only see the rubric on the post-interview Review screen. This was a product call made after reviewing the built UI (not a technical constraint) — live numeric scores read as distracting/judgy mid-interview. State/events are unaffected; only the extension's live-panel rendering changed (`extension/src/components/InterviewPanel.tsx`). If a future need re-emerges for live rubric visibility (e.g. an interviewer-facing view), the data is already there — it's a UI-only change to re-add.
- **Testing strategy:** unit tests — updates clamp to [0,3], history is append-only and queryable by category, evidence field is required (schema-enforced, not optional).
- **Risks:** noisy/too-frequent updates degrading the "evidence-based" feel — the controller only applies rubric updates that ride along with an already-gated interviewer action, never on a separate trigger.
- **Done when:** Feature 13 acceptance criteria met.

### P. Final interview review

- **Responsibility:** produce the grounded end-of-interview scorecard.
- **Files:** `backend/app/agents/evaluator.py`.
- **Inputs:** the full `InterviewState` at `session.end` — transcript, code snapshot history, rubric history with evidence, hint usage, stage timeline.
- **Outputs:** `FinalReview {overall_score, rubric_breakdown, strengths[], areas_to_improve[], timeline[], evidence[]}` — every strength/weakness bullet must cite an evidence pointer from the interview record; the evaluator prompt explicitly forbids generic statements not traceable to the record.
- **Dependencies:** §J's LLM provider (separate evaluator prompt, not the interviewer prompt).
- **Testing strategy:** schema validation tests with the mock provider; manual qualitative check that a real run's review actually references things that happened in that specific session.
- **Risks:** LLM inventing unevidenced claims — mitigated by prompting with the evidence list as the only allowed source material and by a lightweight post-hoc check that each cited evidence id actually exists in the session record (reject/retry once if not).
- **Done when:** Feature 14 acceptance criteria met.

### Q. Persistence

- **Responsibility:** store enough to replay/review a session later.
- **Files:** `backend/app/persistence/{repository.py,in_memory.py,postgres.py,database.py}`.
- **Inputs:** `InterviewState` snapshots at meaningful points, final `FinalReview`.
- **Outputs:** a `SessionRepository` interface (`save_session`, `get_session`, `append_event`) with two implementations: `InMemoryRepository` (default, used whenever `SUPABASE_URL`/`DATABASE_URL` is absent) and `PostgresRepository` (Supabase-hosted Postgres in real deployment).
- **Schema (Postgres):** one `interview_sessions` table — relational columns for `id, problem_slug, started_at, ended_at, status`, JSONB columns for `transcript, code_snapshots, rubric_history, events, final_review`. Deliberately not fully normalized — a hackathon-appropriate tradeoff; revisit only if querying individual transcript segments across sessions becomes a real product need.
- **Dependencies:** `asyncpg`/SQLAlchemy async for Postgres access; no ORM ceremony beyond what's needed to read/write JSONB blobs.
- **Testing strategy:** repository interface tested against `InMemoryRepository` in unit tests (fast, no DB needed); a small integration test against a real/dockerized Postgres is optional and not required for the MVP demo.
- **Risks:** the in-memory default means local dev sessions vanish on backend restart — acceptable and expected; documented in README so nobody is surprised.
- **Done when:** Feature 15 acceptance criteria met with at least the in-memory path fully working; Postgres path working once Supabase credentials are available.

### R. Testing

- **Responsibility:** catch regressions in state transitions, contracts, and controller logic without over-testing UI pixels.
- **Layers:**
  - Backend unit tests (`pytest`): state machine, rubric, hint levels, controller gating, schema validation/rejection.
  - Extension unit tests (`vitest` + React Testing Library): reducer transitions, key component states (recording indicator, rubric bars, transcript ordering).
  - Contract check: a shared fixture file of example event payloads (`shared/fixtures/*.json`) is validated both by the backend's Pydantic models (`pytest`) and the extension's Zod schemas (`vitest`) — this is how drift between the two hand-mirrored schema definitions (§ deviation table) is actually caught, rather than trusted by convention.
  - Integration: one backend test driving the full happy path over a real WS connection using mock providers end-to-end (`start → transcript → code_update → interviewer question → hint → end → review`).
  - Manual: real Chrome + real LeetCode problem page, checked at the end of every phase per `CLAUDE.md`.
- **Done when:** each feature's `FEATURE_PROGRESS.md` entry lists concrete tests run under "Tests/checks run," not "N/A."

### S. Local development

- **Responsibility:** let a developer run the entire product with zero external API keys.
- **Files:** `scripts/dev.sh`, `.env.example`, mock providers in every `providers/*` subpackage.
- **Mechanism:** `USE_MOCK_PROVIDERS=true` (or simply: missing keys) routes LLM/STT/TTS through their mock implementations. Mock LLM returns rule-based canned responses keyed by stage. Mock STT does nothing on its own — a `dev.simulate_transcript` WS event (gated to mock mode) lets a developer type candidate speech instead of talking, so the controller/LLM/UI loop is fully exercisable without a microphone. Mock TTS returns no audio; text still flows.
- **Testing strategy:** the mock-provider path *is* the integration test environment (§R).
- **Done when:** `scripts/dev.sh` boots backend + extension with no `.env` values set at all, and the happy path is exercisable via `dev.simulate_transcript`.

### T. Deployment

- **Responsibility:** get a working demo running reliably.
- **Decision:** default to running both extension (loaded unpacked) and backend **locally** during the actual hackathon demo — lowest latency, no dependency on third-party hosting uptime during judging. A hosted backend (Render/Railway/Fly.io, single instance, no autoscaling needed) is an optional stretch documented in README for remote demos, not required for MVP done-ness.
- **Files:** none required for local-only path; a `Dockerfile` for the backend is a nice-to-have if time allows, not blocking.
- **Testing strategy:** README setup instructions themselves are the test — verified by following them on a clean checkout before calling Feature 16 done.
- **Done when:** Feature 16 acceptance criteria met for the local path; cloud deploy is explicitly out of MVP scope (PRD §17).

### U. Secrets/environment variables

- **Responsibility:** no provider secret ever ships in the extension bundle (CLAUDE.md §7, non-negotiable).
- **Variables (backend-only, `.env`):**

```text
ANTHROPIC_API_KEY=
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=              # optional direct Postgres connection string, alternative to Supabase client
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
ALLOWED_ORIGINS=chrome-extension://<dev-extension-id>,https://leetcode.com
APP_ENV=local               # local | staging | production
USE_MOCK_PROVIDERS=true     # forces mocks even if keys are present — safe default for local dev
```

- **Extension-side config:** only the backend WS URL (`VITE_BACKEND_WS_URL`), which is not a secret.
- **Testing strategy:** a lint/check step (`scripts/check.sh`) greps the built extension bundle for known key prefixes/variable names as a tripwire before considering any release build "done."
- **Done when:** `.env.example` exists with every variable above documented, and the bundle-grep check passes.

### V. Error handling

Mapped 1:1 to PRD §14 scenarios and their implementation mechanism:

| Scenario | Mechanism |
|---|---|
| Microphone denied | `PermissionGate.tsx` blocks session start with a clear message; session can still start in a "no-audio" reduced mode only if the product explicitly allows it — MVP default: mic is required, screen is not |
| Screen-capture denied | Session proceeds without it; `screen.recording.started` is simply never sent; UI shows "screen recording off" rather than blocking |
| STT failure | Backend catches provider errors, emits `error {code: "stt_unavailable", recoverable: true}`, session continues text-only via `dev.simulate_transcript`-style fallback is dev-only — in production this means "no live transcript until reconnect," not session death |
| TTS failure | `interviewer.transcript` always sent independent of audio; audio failure is silent-degrade, logged, not surfaced as a blocking error |
| WebSocket disconnect | Exponential backoff reconnect + `session.resume` replay (§G) |
| LeetCode DOM/editor changes | Extraction isolated behind `§D`'s adapter; failure there degrades to "code extraction unavailable, continue on transcript only" rather than crashing the content script |

- **Done when:** every row above has a corresponding manual test performed at least once before Feature 16 is marked done.

### W. Latency optimisation

- **Responsibility:** keep the perceived candidate-speech-end → interviewer-audio-start latency near the 1–2s target (NFR1, not a hard requirement).
- **Techniques:**
  - STT partials update the UI immediately; only `transcript.final` triggers controller evaluation.
  - LLM interviewer calls use a condensed context window (recent transcript tail + current code + stage + rubric), not the full session history — keeps prompt small and latency low.
  - TTS audio is played as chunks arrive (streaming), not after the full clip finishes synthesizing.
  - Code analysis (§K) runs deterministically first (near-instant for Python `ast`); the LLM is only invoked for higher-level reasoning, not for every analysis.
  - Debouncing (§L rule 3) is itself a latency-and-cost optimization — fewer, more meaningful LLM calls.
- **Testing strategy:** manual timing during rehearsal runs; no automated latency assertions for MVP (network-dependent, not worth mocking away the exact thing being measured).
- **Done when:** a rehearsed full run feels conversational; this is a qualitative, demo-readiness criterion tracked in Feature 16, not a hard pass/fail unit test.

---

## 4. Open questions / risks to revisit

- ~~Monaco MAIN-world bridge (§D) is the single highest-risk integration point~~ — **resolved 2026-09-12**: confirmed working live against 3 real problem pages (`window.monaco.editor.getEditors()` is populated, and `[data-track-load="code_editor"]` reliably disambiguates the real editor from other Monaco models on the page). Implemented in `extension/src/content/mainWorldBridge.ts` + `editor.ts`. Remaining residual risk is unchanged in kind (LeetCode could change this markup later) but no longer unvalidated.
- In-memory session state (§G, §Q defaults) means the backend is single-process and session data does not survive a backend restart — fine for a hackathon demo, explicitly not production-ready, and should not be silently "fixed" by adding infrastructure before it's actually needed.
- Hand-mirrored schemas (§ deviation table, §R) are a known drift risk, mitigated by the shared-fixture contract test, not eliminated by tooling.
- **Tooling constraint, not a product risk:** this session's `claude-in-chrome` browser (which does otherwise reflect real, live extension behavior — see Feature 02-04 verification notes) could not reach `localhost:8000`/`127.0.0.1:8000` at all (a plain `fetch` to `/health` timed out), even though `uv run uvicorn` was confirmed running and answering `curl` from this session's own shell. That automated browser evidently sits on a different host/network namespace. This blocked a true browser-to-live-backend round trip for Feature 06 within this session; the WS protocol itself was instead verified via the backend's own real (non-mocked) ASGI-level `TestClient.websocket_connect` integration tests, and the extension's client state machine via a full reconnect/resume simulation against a fake socket.
- **OPEN BUG — the extension cannot connect to a live backend from a real browser (2026-09-13, unresolved).** This is the project's top blocker: every layer (transport, STT relay, state machine, interviewer, controller, UI wiring) is built and passes automated tests, but the whole thing has never once run end-to-end against a live backend in a real browser. Diagnostic state, so the next session doesn't re-derive it:
  - **Confirmed:** `localhost` resolves to IPv6 `::1` before `127.0.0.1` on macOS (`dscacheutil -q host -a name localhost`), while `uvicorn --host 0.0.0.0` binds **IPv4 only** (`lsof -nP -iTCP:8000 -sTCP:LISTEN` → `TYPE IPv4`, `TCP *:8000`). `curl http://[::1]:8000/health` fails; `curl http://127.0.0.1:8000/health` succeeds. `curl` masks the problem because it falls back to IPv4 on its own; Chrome's WebSocket does not.
  - **Applied, unverified:** the extension's default WS URL changed from `ws://localhost:8000/...` to `ws://127.0.0.1:8000/...` (`extension/src/networking/interviewSocket.ts`), confirmed baked into the built bundle. The user reported still failing afterwards, but their console screenshot showed the **old** `ws://localhost:8000` URL, i.e. it may have been taken before the rebuilt extension was reloaded. **Re-test this first** — it may already be fixed.
  - **Ruled out:** missing `.env` files (both optional; defaults verified correct, bundle inspected). Backend not running (answers `curl` throughout). CSP — LeetCode does send a restrictive `connect-src 'self' https://challenges.cloudflare.com`, but the observed console error is `WebSocket connection to '...' failed:`, which is a network-establishment failure, **not** the `Refused to connect ... violates ... Content Security Policy` message a CSP block produces. Mixed content — likewise would produce its own distinctive message and does not apply to trustworthy-origin loopback addresses.
  - **Untested hypotheses, in the order worth trying:** (1) stale extension build — just reload and retest; (2) **missing host permission** — `manifest.ts` declares only `host_permissions: ["https://leetcode.com/*"]`, and an MV3 content script making a cross-origin connection may need the target host declared too; try adding `http://127.0.0.1:8000/*` / `ws://127.0.0.1:8000/*`; (3) Chrome **Private Network Access**, which restricts public HTTPS pages (leetcode.com) from reaching private/loopback addresses; if that's the cause the fix is architectural — move the socket into the background service worker (extension context, not page context) and relay over a `chrome.runtime` port, which would reverse §B's "content script owns the WS connection" decision and must be documented as such.
