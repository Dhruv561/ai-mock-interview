# SPIKE — ElevenLabs Conversational AI as the interviewer pipeline

**Status: throwaway.** This is not part of the product's feature roadmap
(`FEATURE_PROGRESS.md`). Everything in *this folder* is a standalone,
disconnected test page — useful for judging raw conversational feel with
zero setup, kept so it can be deleted without touching anything real.

**There is also a real, wired-in version of this pipeline**, now living
inside the actual extension/backend (not in this folder), so it can be
tried on a real LeetCode page with the real panel UI:
- `extension/src/components/ConvaiInterviewPanel.tsx` and its supporting
  `networking/convaiSocket.ts`, `media/convaiMicrophone.ts`,
  `media/useConvaiMicrophoneCapture.ts`, `media/useConvaiAudioPlayback.ts`,
  `state/convaiInterviewEngine.ts`, `content/convaiSession.ts`
- `backend/app/api/convai.py`, `backend/app/providers/convai/elevenlabs.py`

Build the extension with `VITE_USE_ELEVENLABS_CONVAI=true` (see
`extension/.env.example`) to get this panel instead of the real one — see
progress.md's "Spike" section for the full list of decisions/tradeoffs made
wiring it in. This folder's standalone page remains useful as a
zero-extension-rebuild way to sanity-check the agent/turn-taking config
itself before testing the real integration.

## What this answers

The current product architecture (see `architecture.md` §J/§L) uses Deepgram
STT → Claude (with a deterministic *controller* deciding when the
interviewer may speak) → ElevenLabs TTS. That controller exists because
CLAUDE.md principle #4 says the interviewer must not talk over every event —
silence is intentional.

ElevenLabs Conversational AI ("Agents Platform") is a different shape: one
hosted agent that owns STT, an LLM, TTS, and turn-taking/interruption
handling itself, over a single WebSocket. This spike exists to answer one
question: **does its built-in turn-taking actually know when to be quiet
during a coding interview, well enough to be worth losing our own
controller's explicit rules?**

Nothing here evaluates hints, rubric scoring, or code awareness — just the
raw feel of the conversation (latency, interruption behaviour, whether it
waits for you to finish talking).

## Architecture (deliberately minimal)

```
web/index.html + web/main.js  --(fetch)-->  server.py  --(xi-api-key)-->  ElevenLabs REST (signed url)
        |                                                                        |
        '-------------------------- wss://api.elevenlabs.io/v1/convai/... <------'
        (via @elevenlabs/client SDK, loaded from jsDelivr as an ES module)
```

- `server.py` — a ~40-line FastAPI app with exactly one real endpoint,
  `GET /signed-url`. It calls ElevenLabs' `get-signed-url` REST endpoint
  server-side with `ELEVENLABS_API_KEY` and hands the browser a short-lived
  signed WebSocket URL. **The API key never reaches the browser** — same
  rule as CLAUDE.md §7, applied to this spike too.
- `create_agent.py` — one-off script, run once, to create the ElevenLabs
  agent (persona/system prompt + voice) via their REST API and print the
  `agent_id` to put in `.env`.
- `web/` — a plain static page, no build step. Uses ElevenLabs' own
  `@elevenlabs/client` SDK (via jsDelivr's `+esm` CDN endpoint) so mic
  capture, audio playback, and the WebSocket audio framing are handled by
  ElevenLabs' own code, not hand-rolled here — the whole point of a janky
  spike is to not spend time re-implementing PCM chunking that a maintained
  SDK already does correctly.

## Running it

1. `cd spikes/elevenlabs-convai`
2. `.env` already has `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` copied
   from `backend/.env` (gitignored, not committed).
3. One-time setup: `pip install fastapi uvicorn httpx python-dotenv` (or
   reuse the backend's `uv` env — no shared dependency on the real backend
   code either way), then `python create_agent.py`. Copy the printed
   `AGENT_ID=...` line into `.env`.
4. `python server.py` (serves the relay API AND the static `web/` page on
   `http://localhost:8899`).
5. Open `http://localhost:8899` in a normal Chrome tab, click **Start**,
   allow mic access, and just talk — no extension, no LeetCode page needed
   for this comparison.

## What to judge

- Does it interrupt you mid-sentence, or wait for a real pause?
- Can *you* interrupt *it* by talking, the way a real interviewer lets you?
- Round-trip latency (you stop talking → it starts responding) vs. the
  current pipeline's feel.
- Does it stay quiet for long stretches while you're clearly still
  thinking/typing, or does it fill every silence?

## Known limitations (intentional, not bugs)

- No code awareness at all — the agent has no idea what you're typing.
- No hint tiers, no rubric, no evidence-based review — this only spikes the
  conversational feel, per CLAUDE.md's "guide rather than solve" and
  "evidence-based feedback" principles, which this pipeline shape makes
  much harder to enforce (see the architectural tension noted in
  `progress.md`).
- Single hardcoded agent persona in `create_agent.py`, not driven by the
  real `InterviewState`.
