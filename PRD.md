# AI LeetCode Mock Interview Extension — Product Requirements Specification

**Project:** AI Mock Interview Chrome Extension for LeetCode-style coding platforms  
**Primary use case:** Real-time technical interview simulation with voice, code awareness, screen recording, interviewer-style questioning, hints, rubric scoring, and end-of-interview feedback.  
**Status:** Hackathon MVP specification  

---

## 1. Product Vision

Build a Chrome extension that turns a LeetCode coding problem into a realistic technical interview.

The candidate should be able to start an interview, talk through their approach, write code, and receive natural interviewer questions in real time. The AI should understand the candidate's spoken reasoning, current code, problem context, and interview progress. It should challenge the candidate, ask follow-up questions, provide controlled hints when requested, and produce a grounded performance review at the end.

The product should feel like an interviewer sitting beside the candidate, not like a chatbot in another browser tab.

### Core product principle

**LeetCode remains the primary workspace. The AI interviewer is a lightweight layer over it.**

The primary UI is a persistent right-side interview panel with a small recording/active indicator. The candidate should always know that the interview is active without the UI becoming distracting.

---

## 2. Hackathon MVP Goal

The MVP only needs to make one polished end-to-end interview flow work reliably.

### Target demo flow

1. Candidate opens a supported LeetCode problem.
2. Candidate clicks `Start AI Interview` in the extension.
3. The extension requests microphone and screen/tab permissions.
4. The interview overlay opens on the right side of the page.
5. The AI interviewer welcomes the candidate and asks them to explain their approach before coding.
6. Candidate speaks naturally.
7. Speech is transcribed in near real time.
8. Candidate starts coding.
9. The extension tracks code changes.
10. The backend maintains interview state.
11. The AI analyses the candidate's approach, code, complexity and communication.
12. At appropriate moments, the interviewer asks a follow-up question using ElevenLabs voice.
13. Candidate can request a hint.
14. The AI provides a controlled hint rather than immediately giving the solution.
15. Candidate finishes.
16. Candidate clicks `End & Review`.
17. The product generates a structured scorecard with evidence from the interview.

The experience should be fast, polished and convincing before adding broad platform support or advanced automation.

---

## 3. Product Experience

### 3.1 Live interview layout

LeetCode remains visible on the left. The extension mounts a full-height right-side panel approximately 360–450px wide.

Conceptually:

```text
┌──────────────────────────────────────────────────────────────┐
│                     LEETCODE PAGE                            │
│                                                              │
│  Problem + editor                         AI INTERVIEWER     │
│                                        ┌───────────────────┐ │
│                                        │ ● RECORDING 18:42 │ │
│                                        ├───────────────────┤ │
│                                        │ INTERVIEWER       │ │
│                                        │ Walk me through   │ │
│                                        │ your approach...  │ │
│                                        │                   │ │
│                                        │ YOU               │ │
│                                        │ I'll sort by...   │ │
│                                        │                   │ │
│                                        │ ┌───────────────┐ │ │
│                                        │ │ INTERVIEWER   │ │ │
│                                        │ │ What's the     │ │ │
│                                        │ │ cost of sort? │ │ │
│                                        │ └───────────────┘ │ │
│                                        ├───────────────────┤ │
│                                        │ RUBRIC SO FAR     │ │
│                                        │ Clarifying  ███ 3 │ │
│                                        │ Approach    ██░ 2 │ │
│                                        │ Code        █░░ 1 │ │
│                                        │ Complexity  ░░░ 0 │ │
│                                        ├───────────────────┤ │
│                                        │ [ Ask for a hint ] │ │
│                                        │ [ End & review   ] │ │
│                                        └───────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

The visual reference is a clean developer-tool aesthetic: off-white/light background, thin borders, dark text, muted green/teal status accents, compact monospace labels, subtle rounded cards, and minimal visual noise.

Do not make the product look like a generic consumer chatbot. It should feel like a serious developer tool.

### 3.2 Persistent active indicator

In addition to the panel, show a small persistent indicator near the panel or browser viewport:

- `● RECORDING`
- `◌ ANALYSING`
- `Ⅱ PAUSED`

The indicator must make recording state obvious.

The visual animation should be subtle rather than flashy.

### 3.3 Live panel sections

The panel contains:

1. Status header
   - Recording/analysis/paused state
   - Elapsed interview time

2. Conversation feed
   - Interviewer messages
   - Candidate transcript segments
   - Current interviewer question visually emphasised

3. Rubric
   - Clarifying questions
   - Approach
   - Code quality
   - Complexity
   - Communication
   - Testing

4. Actions
   - `Ask for a hint`
   - `End & review`
   - Optional pause control

### 3.4 End-of-interview review

The final view should show:

- Overall score
- Rubric breakdown
- Strengths
- Areas to improve
- Timeline / notable moments
- Evidence-backed observations

Example:

```text
INTERVIEW COMPLETE

Overall
8.2 / 10

Problem Solving       ████████░░  8/10
Communication         █████████░  9/10
Code Quality          ███████░░░  7/10
Complexity            ██████░░░░  6/10

What you did well
✓ Clearly explained the initial approach
✓ Asked useful clarifying questions
✓ Implemented merge logic correctly

Work on
⚠ Complexity explanation was initially incomplete
⚠ You did not proactively test the empty-input case
```

The feedback must be tied to actual transcript/code events rather than generic statements.

---

## 4. Functional Requirements

### FR1 — Detect supported coding page

The extension must detect that the current page is a supported coding problem page.

For the first MVP, support one concrete LeetCode coding-page layout robustly rather than pretending to support every possible page.

### FR2 — Extract problem information

Extract at minimum:

- Problem title
- Difficulty
- Problem description
- Relevant constraints where accessible
- Programming language

The first implementation may use DOM extraction.

### FR3 — Capture candidate microphone audio

The extension must:

- Request microphone permission
- Capture candidate speech
- Stream or chunk audio to the backend/STT service
- Preserve timestamps where practical
- Clearly communicate recording state to the user

### FR4 — Screen/tab recording

The extension must support browser-based screen/tab capture for the MVP.

However, screen video is not the primary real-time source for code understanding. Code should be extracted directly from the editor whenever possible.

Actual video can be recorded locally or streamed/chunked for later review.

### FR5 — Capture code state

The extension should capture the current code editor contents and meaningful changes.

Requirements:

- Language
- Full current source code
- Code updates / snapshots
- Timestamp for meaningful changes

Do not send an LLM request on every keystroke.

Use debouncing/change thresholds to avoid excessive traffic.

### FR6 — Real-time speech-to-text

The system should produce transcript segments with low enough latency to support natural conversation.

The transcript should distinguish at least:

- Candidate speech
- Interviewer speech

### FR7 — Interview state machine

The backend must maintain an explicit interview stage.

Suggested stages:

- `intro`
- `clarification`
- `approach`
- `complexity`
- `coding`
- `testing`
- `optimisation`
- `review`

The state machine should prevent the LLM from speaking at arbitrary times.

### FR8 — AI interviewer

The AI interviewer must:

- Understand the problem
- Understand the current code
- Understand recent candidate speech
- Track what has already been asked
- Ask relevant follow-up questions
- Challenge incorrect assumptions
- Avoid unnecessarily interrupting productive coding
- Guide rather than immediately solve
- Behave like a realistic technical interviewer

Example:

Candidate says:
> "I'll sort by start time and sweep through the intervals."

Current code includes sorting.

AI should be able to ask:
> "Good. What's the cost of that sort, and can you do better than that?"

The system should not simply dump the optimal solution.

### FR9 — Code analysis

Create a separate code analysis layer rather than using the interviewer LLM for every code observation.

The code analysis layer should identify where practical:

- Syntax errors
- Obvious bugs
- Approximate time complexity
- Approximate space complexity
- Suspicious patterns
- Potential edge cases
- Whether code appears to implement the described approach

Use deterministic analysis where possible, including Python AST/static analysis for Python code. Use an LLM for higher-level reasoning.

### FR10 — Interview controller

Create a controller layer that decides whether the AI should:

- Remain silent
- Ask a question
- Provide a hint
- Update hidden state
- Transition interview stage
- Trigger final review

The LLM should propose or generate interview content, but the controller should enforce product rules.

### FR11 — ElevenLabs voice

Use ElevenLabs for interviewer text-to-speech.

Requirements:

- Stream audio where supported
- Minimise perceived latency
- Play interviewer response in the extension
- Handle playback interruptions gracefully
- Visually indicate when the interviewer is speaking if useful

ElevenLabs API credentials must only be held on the backend, never exposed in client-side code.

### FR12 — Hint system

Hints are deliberately tiered:

- Level 1: conceptual nudge
- Level 2: more specific direction
- Level 3: strong guidance toward the solution

Example:

Level 1:
> "Think about whether you need to search the previously seen intervals repeatedly."

Level 2:
> "What data structure could make lookups more efficient?"

Level 3:
> "Consider storing previously seen values in a hash map."

Hint usage should affect the final evaluation.

### FR13 — Rubric scoring

The backend maintains structured rubric state.

Minimum rubric:

```json
{
  "clarifying": 0,
  "approach": 0,
  "code_quality": 0,
  "complexity": 0,
  "communication": 0,
  "testing": 0
}
```

Each category should be scored on a 0–3 scale during the live interview and converted into the final score later.

Rubric updates should occur after meaningful evidence, not continuously on every event.

### FR14 — Final review

At interview completion, produce:

- Overall score
- Rubric scores
- Strengths
- Areas for improvement
- Notable timeline events
- Specific evidence from transcript/code
- Hint usage
- Optional final complexity / correctness summary

### FR15 — Session persistence

Store enough information to replay/review an interview.

At minimum:

- Problem
- Interview metadata
- Transcript
- Code snapshots
- Rubric history
- Interview events
- Final feedback

---

## 5. Non-Functional Requirements

### NFR1 — Low latency

The interview should feel conversational.

Target perceived latency from candidate finishing speech to interviewer audio beginning: approximately 1–2 seconds where technically achievable.

This is a target, not a hard contractual requirement for the hackathon.

### NFR2 — Reliability

The demo should tolerate:

- Temporary WebSocket reconnects
- STT errors
- ElevenLabs errors
- Missing code updates
- User pausing/resuming

Graceful degradation is preferable to a broken interview session.

### NFR3 — Privacy and security

- API keys remain server-side
- Microphone and screen permissions are explicit
- Do not silently record
- Show active recording state
- Do not log raw audio unnecessarily
- Avoid sending full screen video through the LLM unless necessary

### NFR4 — Maintainability

Use clear separation between:

- Extension UI
- Browser integration
- Media capture
- Real-time transport
- Interview state
- AI agents
- Persistence

### NFR5 — Hackathon practicality

Prefer a simple, working solution to a production-scale distributed system.

Do not introduce unnecessary microservices, queues or complex infrastructure unless they are required for the MVP.

---

## 6. High-Level Architecture

```text
                         CHROME EXTENSION
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  LeetCode Content Script                                   │
│  ├─ Detect problem                                         │
│  ├─ Extract problem metadata                               │
│  ├─ Read code editor                                       │
│  └─ Observe meaningful code changes                        │
│                                                            │
│  Interview UI                                              │
│  ├─ Status indicator                                       │
│  ├─ Transcript                                             │
│  ├─ Current question                                       │
│  ├─ Rubric                                                 │
│  ├─ Hint button                                            │
│  └─ End & review                                           │
│                                                            │
│  Media                                                     │
│  ├─ Microphone                                             │
│  └─ Screen/tab recording                                   │
│                                                            │
└──────────────────────────────┬─────────────────────────────┘
                               │
                         WebSocket / HTTPS
                               │
                               ▼
                         FASTAPI BACKEND
┌────────────────────────────────────────────────────────────┐
│                                                            │
│ Session Manager                                            │
│                                                            │
│ Interview State                                            │
│       │                                                    │
│       ├──────────────┬──────────────┐                     │
│       ▼              ▼              ▼                     │
│ Speech/STT      Code Analysis   Event Processing          │
│       │              │              │                     │
│       └──────────────┼──────────────┘                     │
│                      ▼                                     │
│              Interview Controller                          │
│                      │                                     │
│              ┌───────▼────────┐                            │
│              │ Interview LLM  │                            │
│              └───────┬────────┘                            │
│                      │                                     │
│            ┌─────────┴──────────┐                          │
│            ▼                    ▼                          │
│      Question / Hint      Rubric Update                    │
│            │                                               │
│            ▼                                               │
│       ElevenLabs                                            │
│            │                                               │
│            ▼                                               │
│       Audio → extension                                     │
│                                                            │
│       Supabase / PostgreSQL                                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 7. Recommended Technology Stack

### Extension

- TypeScript
- React
- Vite
- Chrome Extension Manifest V3
- Tailwind CSS

### Backend

- Python
- FastAPI
- WebSockets
- Pydantic models

### AI

- LLM API suitable for low-latency interview reasoning
- Structured JSON outputs for controller decisions
- Separate prompts/roles for interviewer, code analysis and final evaluator

### Speech

- Streaming speech-to-text provider
- ElevenLabs for text-to-speech

### Storage

- Supabase PostgreSQL

### Code analysis

- Python AST/static analysis
- LLM-assisted reasoning

### Deployment

- Extension loaded locally during hackathon
- Frontend/backend deployed using simple services such as Vercel + Railway/Render/etc., or run locally if that is more reliable for the demo

---

## 8. Proposed Repository Structure

```text
ai-mock-interview/
│
├── README.md
├── PRD.md
├── CLAUDE.md
├── progress.md
├── architecture.md
├── .env.example
├── .gitignore
│
├── extension/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── public/
│   │   └── icons/
│   └── src/
│       ├── manifest.ts
│       ├── content/
│       │   ├── index.tsx
│       │   ├── leetcode.ts
│       │   └── editor.ts
│       ├── components/
│       │   ├── InterviewPanel.tsx
│       │   ├── StatusIndicator.tsx
│       │   ├── Transcript.tsx
│       │   ├── Rubric.tsx
│       │   ├── HintButton.tsx
│       │   └── Review.tsx
│       ├── state/
│       │   └── interviewStore.ts
│       ├── media/
│       │   ├── microphone.ts
│       │   └── screen.ts
│       ├── networking/
│       │   └── websocket.ts
│       └── styles/
│           └── globals.css
│
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── api/
│   │   │   └── routes.py
│   │   ├── websocket/
│   │   │   └── interview.py
│   │   ├── interview/
│   │   │   ├── state.py
│   │   │   ├── controller.py
│   │   │   ├── prompts.py
│   │   │   └── schemas.py
│   │   ├── agents/
│   │   │   ├── interviewer.py
│   │   │   ├── code_analyser.py
│   │   │   └── evaluator.py
│   │   ├── speech/
│   │   │   ├── stt.py
│   │   │   └── elevenlabs.py
│   │   ├── leetcode/
│   │   │   └── parser.py
│   │   ├── persistence/
│   │   │   └── database.py
│   │   └── services/
│   │       └── events.py
│   └── tests/
│
├── shared/
│   ├── schemas/
│   │   └── events.ts
│   └── examples/
│
├── scripts/
│   ├── dev.sh
│   └── check.sh
│
└── docs/
    ├── design.md
    └── demo.md
```

The exact implementation structure may change if Claude Code finds a simpler architecture, but separation of extension, backend and shared protocol should remain.

---

## 9. Core Data Contracts

### Client → backend events

Example event types:

```text
session.start
session.pause
session.resume
session.end
transcript.partial
transcript.final
code.update
screen.recording.started
screen.recording.stopped
hint.requested
```

### Backend → client events

```text
session.started
interviewer.state
interviewer.transcript
interviewer.audio
rubric.updated
hint.response
review.ready
error
```

Use typed schemas rather than arbitrary JSON wherever practical.

Example:

```json
{
  "type": "code.update",
  "timestamp": 1736150000,
  "language": "python",
  "code": "def merge(intervals): ..."
}
```

---

## 10. Interview Controller Rules

The controller should enforce rules such as:

1. Do not interrupt while the candidate is speaking unless interruption is deliberately part of the interview design.
2. Do not respond to every code change.
3. Do not reveal the optimal solution unless the candidate has exhausted the allowed guidance or the interviewer mode explicitly permits it.
4. Prefer questions that test reasoning over statements that tell the candidate what to do.
5. Avoid repeating questions already answered.
6. Keep the interview moving through stages.
7. Use the candidate's exact current code when challenging complexity/correctness.
8. Ground final feedback in actual events.

---

## 11. AI Roles

### Interviewer agent

Purpose: behave like a realistic technical interviewer.

Inputs:

- Problem metadata
- Current interview stage
- Recent transcript
- Current code
- Code-analysis summary
- Interview history
- Rubric state

Outputs should be structured, for example:

```json
{
  "action": "ask_question",
  "stage_transition": null,
  "message": "What's the time complexity of your current approach?",
  "rubric_updates": {
    "approach": 1
  }
}
```

### Code analyst

Purpose: detect facts about the implementation.

It should prefer deterministic/static signals where possible, then use an LLM when higher-level interpretation is required.

### Evaluator

Purpose: produce the final grounded assessment from the full interview record.

The evaluator should not invent behaviour that is absent from the evidence.

---

## 12. UI / Design System Requirements

Use the supplied visual reference as the primary design inspiration.

Design qualities:

- Clean
- Developer-focused
- Minimal
- Calm
- High information density without feeling cluttered
- Strong typography hierarchy
- Thin borders
- Soft cards
- Restrained accent colour
- Small monospace metadata labels
- Clear state indicators
- Minimal animations

Avoid:

- Generic ChatGPT-style bubble overload
- Large gradients
- Excessive rounded cards
- Huge headings
- Excessive shadows
- Gamified visuals
- Excessive colour

The live interviewer message should receive stronger visual emphasis than historical transcript messages.

The current AI question should be unmistakable.

---

## 13. Privacy / Permission UX

Before starting an interview, explicitly communicate that:

- Microphone is being recorded
- Screen/tab may be recorded
- The candidate can pause/end the interview

The UI should never suggest that recording is active if media capture is not actually active.

API secrets must never be shipped to the extension bundle.

---

## 14. Error Handling

At minimum handle:

### Microphone failure

Show a clear message and prevent starting the interview if audio is essential to the chosen mode.

### Screen-capture denial

Allow a fallback mode without screen recording if code and audio still work, unless the demo explicitly requires it.

### STT failure

Show a temporary status and continue the session if possible.

### TTS failure

Show the text response in the panel so the interview can continue.

### WebSocket disconnect

Attempt reconnect and resynchronise the session state.

### LeetCode DOM/editor changes

Fail gracefully if selectors break. Keep page-specific integration isolated so it can be fixed without rewriting the rest of the app.

---

## 15. Testing Requirements

Claude Code should create tests incrementally.

At minimum:

### Backend unit tests

- Interview state transitions
- Rubric updates
- Hint levels
- Controller decisions
- Event schemas
- Invalid event handling

### Extension tests

- UI state transitions
- Recording indicator states
- WebSocket message handling
- Rubric rendering

### Integration tests

One end-to-end happy path:

`start → candidate transcript → code update → AI question → hint → end → final review`

### Manual browser test

Load the extension in Chrome and test against a real supported LeetCode problem page.

---

## 16. Definition of Done for MVP

The MVP is complete when a developer can:

1. Run the extension and backend locally.
2. Open the supported LeetCode problem.
3. Start an interview.
4. See a persistent active recording indicator.
5. See the interviewer panel.
6. Speak through the microphone.
7. See transcript updates.
8. Have the extension detect meaningful code changes.
9. Receive at least one contextually relevant AI question based on the candidate's speech/code.
10. Hear the interviewer through ElevenLabs.
11. Request at least one hint.
12. Complete the interview.
13. Receive a final scorecard with evidence-based feedback.
14. Have no API secrets exposed in browser code.
15. Recover reasonably from a temporary network failure.

---

## 17. Scope to Defer

Do not prioritise these until the core loop works:

- Multiple coding platforms
- Full OCR of arbitrary screens
- Complex user accounts
- Recruiter dashboards
- Multi-user collaboration
- Production-scale queues
- Kubernetes / microservices
- Long-term video storage architecture
- Advanced computer vision
- Perfect automated code execution across every language
- Mobile support

The hackathon success criterion is **a polished realistic interview experience**, not infrastructure complexity.

---

## 18. Suggested Build Order

Claude Code should split implementation into vertical milestones rather than building every backend component independently.

### Phase 0 — Repository and planning

Create project skeleton, conventions, architecture notes, environment configuration, shared schemas, progress tracking and test strategy.

### Phase 1 — Extension shell + visual UI

Build the right-side panel, active indicator, transcript, rubric, hint button and end-review states using mocked data.

Goal: make the product visually convincing before wiring AI.

### Phase 2 — LeetCode integration

Detect the page, extract problem details and read the current code editor. Implement robust code-change detection.

### Phase 3 — Real-time transport

Implement client/backend WebSocket connection and typed events.

### Phase 4 — Microphone + STT

Implement candidate audio capture and streaming/final transcript events.

### Phase 5 — Interview state machine

Implement session state and deterministic stage transitions.

### Phase 6 — AI interviewer

Connect the LLM, structured outputs, controller and contextual questioning.

### Phase 7 — ElevenLabs

Add streaming interviewer audio and playback.

### Phase 8 — Hint system + rubric

Implement tiered hints, rubric updates and evidence events.

### Phase 9 — Final review

Generate grounded final feedback and render the review UI.

### Phase 10 — Screen recording / polish

Add or refine screen/tab recording, permission UX, animations, error states and demo polish.

### Phase 11 — End-to-end hardening

Run the entire happy path repeatedly and fix latency, race conditions, UI overflow, state bugs and broken browser integration.

---

## 19. Development Rules for Claude Code

Claude Code should:

- Read `PRD.md` before making architectural decisions.
- Inspect the existing repository before creating new files.
- Keep the architecture simple enough for a hackathon.
- Use typed contracts for cross-process events.
- Implement working vertical slices instead of placeholder-heavy scaffolding.
- Add tests as components become functional.
- Avoid unnecessary abstractions.
- Keep secrets in environment variables.
- Use real provider APIs once their integration stage is reached.
- Prefer evidence from actual code/transcript over LLM guesses.
- Keep a `progress.md` file with completed work, current task, known issues and next steps.
- Update the README with setup instructions as the architecture evolves.
- Make small logical commits where practical.

For UI work, Claude Code should first reproduce the supplied design direction with mocked interview data before connecting live AI services.

---

## 20. Future Product Direction

Once the MVP works, the product can expand into:

- Multiple interview personas
- Difficulty and interview-style selection
- Company-specific interview modes
- Behavioural interviews
- Collaborative whiteboarding
- Real-time execution/test feedback
- Post-interview video timeline
- Longitudinal candidate improvement tracking
- Interview replay with highlighted moments
- Support for HackerRank and other coding platforms

These are future capabilities and should not complicate the hackathon MVP.
