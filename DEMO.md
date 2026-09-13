# DEMO.md — demo rehearsal script

A literal runbook for rehearsing and presenting the live demo. Follow it in order. Based on `PRD.md` §2 (target demo flow) and §16 (Definition of Done for MVP) — this is that flow, not a different one.

For the current implementation status behind each step (what's `VERIFIED` vs `DONE`), see `FEATURE_PROGRESS.md`. For the dashboard/known issues, see `progress.md`.

---

## 1. Setup (before the room / before judges)

Do this well before you're on stage — ideally the night before, at minimum 30+ minutes before your slot.

### 1.1 Decide which providers to run live

Real providers make the demo land harder, but every one of them is optional — the app runs the full happy path on mock providers with **zero API keys** (`USE_MOCK_PROVIDERS=true`, the default; see `README.md` and `.env.example`). Prioritize in this order if you only have time/keys for some:

1. **`ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` — highest impact.** A real interviewer voice is the single biggest "wow" factor in a live demo. Worth prioritizing over the LLM key if you have to choose.
2. **`ANTHROPIC_API_KEY` — matters for genuinely contextual questions.** With the mock LLM provider, questions are deterministic, stage-appropriate canned lines — fine for rehearsing flow, but they won't reference the candidate's actual words or code. A real key is what makes FR8's "ask a follow-up based on what I just said" claim true on stage.
3. **`DEEPGRAM_API_KEY` — real speech-to-text.** Needed if you want to actually talk and see your own words transcribed live rather than using the `dev.simulate_transcript` fallback.
4. **`DATABASE_URL` — not worth it for the demo.** Persistence only matters if you're demoing "look, it's saved" — skip unless someone asks.

**Mock mode is your safe fallback.** If a key dies right before presenting (rate limit, revoked, wrong env var, whatever), set `USE_MOCK_PROVIDERS=true` and restart the backend — the whole flow still works, just with canned interviewer lines and no voice. Rehearse this switch once so it's not the first time you've done it under pressure.

Recall two easy-to-forget rules from `README.md`:
- `USE_MOCK_PROVIDERS=true` overrides every key — you must set it to `false` to actually use the ones you configured.
- `get_settings()` is cached — changing `backend/.env` requires a real backend restart, not just a reload.

### 1.2 Start the backend

```bash
cd backend && uv sync   # once, if not already done
cd .. && ./scripts/dev.sh   # runs backend + extension dev build
```

Or just the backend, if the extension is already built:

```bash
cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Confirm it's up: `curl localhost:8000/health` should return `{"status":"ok",...}`.

### 1.3 Load the extension

1. `npm run --workspace extension build` (or already-built `extension/dist` from a prior session).
2. `chrome://extensions` → enable Developer mode → **Load unpacked** → select `extension/dist`.
3. If you rebuild after this, come back to `chrome://extensions` and click reload on the extension card — it does not hot-reload, especially after a manifest or service-worker change.

### 1.4 Pick the problem

Use a problem that's already been live-verified against the real LeetCode DOM, so you're not the first person to discover a selector broke. Per `progress.md`'s Phase 2/Feature 03-04 notes, three problems have been confirmed live: **Two Sum (Easy)**, **Add Two Numbers (Medium)**, **Merge Intervals (Medium)**.

**Use Two Sum.** It's Easy, has a short, well-known optimal solution (hash map, O(n)), and gives you a clean natural moment for exactly the kind of follow-up question FR8 describes ("what's the cost of that nested loop, can you do better?") without eating your whole time window explaining the problem itself. Add Two Numbers/Merge Intervals are fine backups if Two Sum's page is somehow unavailable, but they take longer to talk through.

---

## 2. The actual click-through

Narrate out loud at each step — both what you're doing and what to have judges notice. Suggested judge call-outs are in *italics*.

### 2.1 Open the problem

Navigate to `leetcode.com/problems/two-sum/`. Wait for the panel to appear docked on the right (it reflows the page, it doesn't overlay the editor).

*"This is a real Chrome extension — LeetCode is still the actual workspace, not a wrapper around it."*

### 2.2 Start AI Interview

Click **Start AI Interview**. Grant mic (and screen, if you're demoing that) permission if not already granted (see the pre-flight checklist below — do this ahead of time so you don't eat a permission prompt live).

Watch the header badge reach **BACKEND CONNECTED**.

*"That badge is a live WebSocket connection to a local backend — point at it, then point at the terminal running uvicorn to show a real request landing."*

### 2.3 Talk through your approach out loud

Before writing code, explain your plan verbally: *"I'll brute-force check every pair first, then optimize with a hash map."*

Watch your words appear in the transcript panel as you speak (real Deepgram STT if configured, or type into `dev.simulate_transcript` if running mock-only).

*"This is a live transcript, not a script — it's building line by line as I talk."*

### 2.4 Write code

Start typing an actual (possibly deliberately naive first-pass) solution into the editor — e.g. the O(n²) nested-loop version first.

### 2.5 Let a code-triggered question land

Pause typing for a couple of seconds after a meaningful chunk of code lands (the detector debounces ~2.5s, so don't rush this). Wait for the interviewer to speak — either through ElevenLabs audio or as text in the transcript.

*"Notice I didn't click anything — the interviewer noticed the code change itself and asked a question. It doesn't do this on every keystroke; it's watching for a meaningful change."*

### 2.6 Ask for a hint

Click **Ask for a hint**. It should come back as a conceptual nudge (level 1), not the answer.

*"Hints are tiered — level 1 is a nudge, not a spoiler. If I ask again it gets more specific, but it's capped at level 3 and still won't just hand me the solution."*

### 2.7 Answer a follow-up (complexity / testing)

When the interviewer asks about complexity ("what's the time complexity of that approach, can you do better?"), answer out loud and then improve the code to the hash-map O(n) solution. If it asks about testing/edge cases, mention the empty-input or no-solution case.

*"Watch it track that I'm improving from the brute-force to the optimal approach — this is what the final review will actually cite."*

### 2.8 End & Review

Click **End & review**. There will be a brief "GENERATING REVIEW…" state while the evaluator LLM call runs — don't panic, let it finish.

### 2.9 Show the evidence-grounded scorecard

Walk through the rubric breakdown, strengths, and areas to improve.

*"This is the important part: point at one strength bullet and its evidence line underneath — it's quoting or citing something that actually happened in this specific session, not a generic 'good communication' statement that could apply to anyone."*

---

## 3. Known rough edges to route around live

These are recorded gaps in `FEATURE_PROGRESS.md`/`architecture.md`, not secrets — but plan around them rather than discovering them live.

- **Real-provider verification gap (Features 05, 08, 10, 11, 13, 14, 15).** Every one of these is `VERIFIED` against mock providers but has not been exercised live against its real API in this environment (no keys were available during development). If this is the first time you're running with real keys, budget a full rehearsal pass first — don't let the demo be the first live test.
- **Reconnects lose transcription for the rest of the interview** (`progress.md`, Known issues). The backend only opens an STT session on `session.start`, not on `session.resume`, so if the WebSocket drops and reconnects mid-interview, live transcription stops working even though the interview itself survives. **Don't demo killing the connection mid-session unless that's a deliberate, rehearsed beat** — if it happens by accident, keep talking through your code out loud; the interview keeps running, just without a fresh transcript.
- **STT failure degrades to silence, not a crash** (`architecture.md` §V). If Deepgram drops or errors, the backend emits a recoverable `stt_unavailable` error and the session continues — no new transcript will appear, but code updates, hints, and the interviewer still work. If this happens on stage: **say so plainly** ("looks like transcription dropped — I'll keep narrating and the interview will still track the code") and keep going. Do not stop and try to fix it live.
- **TTS failure degrades to text, not silence** (`architecture.md` §V). If ElevenLabs fails, `interviewer.transcript` text still always arrives in the panel — just without audio. If the voice stops mid-demo, read the interviewer's line out loud yourself and continue; don't wait on it.
- **No WS-endpoint origin/auth check yet** (Feature 06 known issue) — fine for a local demo, but don't leave the backend port exposed on a shared/public network during the event.
- **Screen/tab recording is unverified in a real browser** (Feature 12) — the permission prompt, the native "Stop sharing" button, and the resulting recording blob have only been tested via injected mocks, not a real `getDisplayMedia` flow. **Skip screen recording in the live demo unless you've personally rehearsed it end-to-end first**; it isn't required for the core flow (mic + code extraction are sufficient per `architecture.md` §V).
- **Session persistence is unverified against a real database** (Feature 15) — don't promise "and it's saved to the database" unless you've actually configured and tested `DATABASE_URL` beforehand.

**General recovery principle:** almost everything in this app is built to degrade to "text still works, interview keeps going" rather than crash. If something visibly breaks, name it once, keep talking through your code and reasoning, and let the interview continue — a judge watching you calmly route around a dropped mic is a better demo than a perfect run with no visible resilience at all.

---

## 4. Pre-flight checklist (10–15 minutes before presenting)

Run through all of these, in order, before you're called up:

- [ ] Backend is running: `curl localhost:8000/health` returns `{"status":"ok",...}`.
- [ ] Correct provider mode is set in `backend/.env` (real keys + `USE_MOCK_PROVIDERS=false`, or deliberately `true` for the safe fallback) — and the backend has been **restarted** since the last edit to `.env`.
- [ ] Extension is loaded and freshly reloaded from `chrome://extensions` after the latest build.
- [ ] Open `leetcode.com/problems/two-sum/` and confirm the panel docks correctly beside the editor.
- [ ] Click Start once beforehand so the mic (and screen, if used) permission prompt has already been granted — you do **not** want a native browser permission dialog popping up live in front of judges.
- [ ] Header badge reaches **BACKEND CONNECTED** within a couple seconds of Start.
- [ ] Do one full 30-second dry run: **Start → say one sentence → ask for a hint → End & review**, and confirm the review screen renders with real (not blank/error) content. Then click **End** again / reload the page to reset state for the real run.
- [ ] Volume up if using real ElevenLabs audio; confirm you can actually hear it in the room, not just your headphones.
- [ ] Know which fallback you're using if something dies: flip `USE_MOCK_PROVIDERS=true` and restart the backend, or just keep narrating through a text-only degrade (see §3 above). Don't decide this for the first time on stage.
