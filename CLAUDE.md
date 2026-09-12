# CLAUDE.md

## Project

AI Mock Interview Chrome Extension

This project is a Chrome extension that turns a coding-platform problem into a realistic AI technical interview. The candidate codes on the existing LeetCode-style page while the extension captures microphone audio, observes code changes, optionally records the tab/screen, transcribes speech, maintains interview state, asks context-aware questions, provides tiered hints, speaks using ElevenLabs, and produces an evidence-based final review.

## Source of truth

Read these files before making significant changes:

1. `PRD.md` — product requirements and intended behaviour.
2. `architecture.md` — current technical architecture and implementation decisions.
3. `FEATURE_PROGRESS.md` — authoritative feature-by-feature implementation state.
4. `progress.md` — high-level project progress, blockers and recent decisions.
5. `docs/ui-reference.png` — primary visual reference for the live interview interface, if present.

When implementation reality conflicts with the PRD, do not silently change requirements. Document the conflict and the chosen approach in `architecture.md` and/or `FEATURE_PROGRESS.md`.

## Core engineering principles

### 1. Build in vertical slices

Prefer an end-to-end working slice over implementing an entire subsystem in isolation.

A good milestone looks like:

UI → event → backend → state → AI/mock response → UI

rather than building every frontend component and then every backend component separately.

### 2. Keep the architecture simple

This is a hackathon project.

Prefer:
- one frontend/extension application
- one backend service
- one database
- WebSockets for real-time communication
- clear TypeScript/Python interfaces

Avoid unnecessary:
- microservices
- message queues
- Kubernetes
- complex event buses
- premature abstractions
- infrastructure that does not improve the demo

### 3. Treat interview state as the core domain object

The product is not just a chatbot.

The backend should maintain explicit interview state such as:
- current interview stage
- problem context
- current code
- transcript
- rubric
- hint level
- timing
- recent interviewer actions
- meaningful code-analysis observations

The LLM should reason using this state rather than receiving an uncontrolled stream of raw events.

### 4. The interviewer should not speak on every event

Silence is intentional.

Do not call the LLM or speak after every keystroke or transcript fragment.

Use:
- debouncing
- meaningful-event detection
- interview-stage rules
- controller logic
- confidence thresholds where appropriate

The candidate should feel like they are talking to an interviewer, not a live autocomplete system.

### 5. Guide rather than solve

The interviewer should generally:
- ask questions
- probe reasoning
- identify inconsistencies
- encourage clarification
- provide graduated hints

Avoid immediately revealing optimal solutions unless the configured interview behaviour explicitly allows it.

### 6. Code understanding should not depend primarily on OCR

Prefer direct extraction of the code from the browser/editor where possible.

Screen/tab recording is an additional multimodal signal and recording artefact, not the primary source of truth for code.

### 7. Never expose secrets in the extension

Provider secrets must stay server-side.

Never put:
- LLM provider secret keys
- ElevenLabs secret keys
- STT provider secret keys
- Supabase service-role keys

into client-side extension code.

Use `.env` for local development and `.env.example` for documented variable names.

### 8. Use typed contracts

Important extension/backend communication must use explicit schemas.

At minimum, define typed event contracts for:
- interview_start
- interview_pause
- interview_resume
- interview_end
- code_update
- transcript_partial
- transcript_final
- screen_state
- interviewer_response
- interviewer_status
- rubric_update
- hint_request
- error

Validate data at system boundaries.

### 9. UI quality is a first-class requirement

The interview overlay should look like a polished developer tool.

Use the supplied UI reference as the visual target.

Important characteristics:
- LeetCode remains the main workspace
- persistent right-side interview panel
- subtle recording/active indicator
- clean transcript
- visually prominent current interviewer message
- rubric section
- Ask for a hint action
- End & review action
- restrained colour palette
- thin borders
- clear typography hierarchy
- minimal animation
- no generic ChatGPT appearance
- no excessive gradients
- no unnecessary gamification

Do not leave all visual polish until the end.

### 10. Evidence-based final feedback

Final interview feedback must be grounded in actual evidence from:
- transcript
- code snapshots
- code-analysis events
- hints
- interview-stage transitions
- interviewer observations

Do not generate generic feedback that could apply to any candidate.

## Development workflow

For every task or feature:

1. Read the relevant existing code and documentation.
2. Identify the feature in `FEATURE_PROGRESS.md`.
3. Read that feature's current status, remaining work and acceptance criteria.
4. Implement only the next sensible slice.
5. Run appropriate tests/type checks/lint/build.
6. Manually verify the behaviour where possible.
7. Update the feature's progress record.
8. Update `progress.md` if the work affects overall project status.
9. Make a small logical git commit when appropriate.
10. Continue only if there is enough remaining work budget/credit for the next safe slice.

## Mandatory feature checkpoint rule

Every feature must have a progress record in `FEATURE_PROGRESS.md`.

Before starting a feature:
- set status to `IN_PROGRESS`
- record `started_at`
- record `current_task`
- record the next concrete implementation step

After every meaningful work slice:
- update `completed`
- update `remaining`
- update `files_changed`
- update `tests_run`
- update `verification`
- update `next_action`

If the session is ending, credits are running low, context is becoming unreliable, or the user asks you to stop:

### STOP PROTOCOL

1. Stop implementation.
2. Do not start a new feature.
3. Finish only the current safe operation.
4. Update `FEATURE_PROGRESS.md`.
5. Set the feature's status to `PAUSED` unless it is actually complete.
6. Record exactly:
   - what was completed
   - what remains
   - current implementation state
   - files changed
   - tests/checks run
   - known issues
   - exact next action
7. Update `progress.md`.
8. Leave the repository in a runnable state.
9. Tell the user where work stopped and what the next session should do first.

A feature must never be left in an ambiguous state.

## Feature completion rule

A feature is not `DONE` merely because code exists.

Use:

`PLANNED → IN_PROGRESS → IMPLEMENTED → VERIFIED → DONE`

A feature may only become `DONE` when:
- implementation is complete
- acceptance criteria are satisfied
- relevant tests/checks pass
- manual verification has been performed where relevant
- no known blocking issue remains
- its progress record says `DONE`

## Testing expectations

Use the simplest appropriate level of testing:

- unit tests for business logic
- schema/contract tests for event payloads
- integration tests for backend flows
- component tests for important UI behaviour
- browser/manual verification for extension behaviour
- build/type/lint checks before completion

Do not claim something works without verifying it.

## External API development

For external services such as LLM, speech-to-text and ElevenLabs:

- create clean provider interfaces
- use mock/local providers when credentials or network access are unavailable
- keep the real provider implementation behind the same interface
- test failure and latency paths
- do not hard-code credentials

The application should still be useful in local development when an external provider is unavailable.

## Browser extension rules

Be careful with:
- Manifest V3 permissions
- content-script isolation
- service worker lifecycle
- host permissions
- audio permissions
- screen/tab capture limitations
- communication between content scripts and extension service workers

Do not assume browser APIs work the same way as a normal web application.

## Code quality

Prefer:
- clear names
- small functions
- explicit interfaces
- minimal duplication
- readable control flow
- comments only where they clarify non-obvious reasoning

Avoid:
- speculative abstractions
- enormous files
- deeply nested logic
- silent fallbacks that hide errors

## Git

Use Git from the beginning.

Make small logical commits such as:

- `feat: add interview overlay shell`
- `feat: add websocket session`
- `feat: add transcript event handling`
- `feat: add interviewer controller`
- `fix: handle extension reconnect`
- `test: add interview state transitions`

Do not make enormous unrelated commits.

## What to do when uncertain

Prefer the simplest implementation that:
1. satisfies the PRD,
2. fits the current architecture,
3. is easy to test,
4. is easy to replace later.

Document meaningful decisions instead of silently improvising.
