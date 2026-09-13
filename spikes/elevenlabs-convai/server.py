"""Spike-only relay server.

Serves the static web/ page and one real endpoint, GET /signed-url, which
calls ElevenLabs server-side so ELEVENLABS_API_KEY never reaches the
browser (same rule as CLAUDE.md #7, applied to this throwaway spike too).

Not part of the real backend app - deliberately standalone so this can be
deleted without touching backend/app/*.
"""
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

API_KEY = os.environ["ELEVENLABS_API_KEY"]
AGENT_ID = os.environ.get("AGENT_ID", "")

app = FastAPI()


@app.get("/signed-url")
def signed_url():
    if not AGENT_ID:
        raise HTTPException(
            500,
            "AGENT_ID not set - run create_agent.py first and add AGENT_ID to .env",
        )
    resp = httpx.get(
        "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
        headers={"xi-api-key": API_KEY},
        params={"agent_id": AGENT_ID},
        timeout=15,
    )
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, resp.text)
    return JSONResponse(resp.json())


# Static page last, so it doesn't shadow /signed-url.
app.mount("/", StaticFiles(directory=Path(__file__).parent / "web", html=True), name="web")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8899)
