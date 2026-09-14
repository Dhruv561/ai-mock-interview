# LarpCode

LarpCode turns a LeetCode style coding problem into a live technical interview. You talk through your approach out loud, write code as you normally would, and an AI interviewer listens, watches your code change, asks follow up questions in a real voice, gives you a hint when you ask for one, and writes up a review grounded in what actually happened in the session.

LeetCode stays the workspace. LarpCode adds a panel next to it, not a separate app.

Built for a hackathon under the "create a new business capability" track: interview practice with an attentive, code aware interviewer, on demand, on the problem you're already solving.

## How it was built

An extension paired with a small backend.

Extension (`extension/`): Vite, React, TypeScript, Tailwind, running as a content script on LeetCode pages. Reads the problem and code directly from the page, captures microphone (and optionally screen or tab) audio, and owns session state.

Backend (`backend/`): FastAPI, Python, managed with `uv`. Holds interview state, decides when the interviewer should speak, and talks to the model and voice providers behind swappable, mockable interfaces.

The default interview runs on a single hosted ElevenLabs Conversational AI agent handling speech to text, reasoning, voice, and turn taking together. An earlier pipeline built from separate pieces (Deepgram, Anthropic Claude, ElevenLabs, plus a deterministic controller) still exists behind a build flag and is what produces tiered hints and a fuller live rubric.

Every provider integration sits behind an interface with a deterministic mock, so the whole thing runs with zero API keys.

## Getting started

Prerequisites: Node 20 or later, Python 3.11 or later, and [`uv`](https://docs.astral.sh/uv/).

```bash
cp .env.example backend/.env     # note: backend/, not the repo root
npm install --legacy-peer-deps
(cd backend && uv sync)
./scripts/dev.sh   # runs the backend and the extension dev build together
```

`--legacy-peer-deps` is needed because a plain `npm install` currently hits a known npm resolver crash on vitest's optional browser mode peer packages.

The environment file has to live at `backend/.env`, not the repo root. The dev script starts the backend from inside `backend/`, and a root level `.env` gets silently ignored.

By default `USE_MOCK_PROVIDERS=true`, so the full flow runs with no API keys at all. Add a real key and that provider switches over automatically. Settings are cached, so a changed key needs a real backend restart.

To load the extension in Chrome: build it with `npm run --workspace extension build`, then go to `chrome://extensions`, turn on Developer mode, choose Load unpacked, and select `extension/dist`. Reload the extension from that page after any rebuild.

With the backend running, open a LeetCode problem and click Start AI Interview. The panel's status badge should read BACKEND CONNECTED.

To run the full check suite (lint, typecheck, test, build for both projects):

```bash
./scripts/check.sh
```

## Project structure

```text
extension/   Chrome extension. Vite, React, TypeScript, Tailwind
backend/     FastAPI backend, Python, managed with uv
shared/      Hand mirrored event schemas (Zod on the TS side, Pydantic on the Python side)
scripts/     dev.sh runs everything locally, check.sh runs lint/type/test/build
docs/        Design reference and supporting docs
```
