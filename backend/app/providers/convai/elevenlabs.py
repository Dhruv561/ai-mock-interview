"""ElevenLabs Conversational AI signed-url fetch — spike only (see
spikes/elevenlabs-convai/README.md and progress.md's "Spike" section).
Not a TTSProvider/LLMProvider/STTProvider — this pipeline replaces all
three at once with one hosted agent, so it doesn't fit that interface
family at all.

A single REST GET, not a stream, so this deliberately uses stdlib
urllib rather than adding httpx as a new runtime dependency for one call
site — same reasoning providers/tts/elevenlabs.py's module docstring
already gives for reusing `websockets` instead of adding httpx there.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from asyncio import to_thread

SIGNED_URL_ENDPOINT = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url"
REQUEST_TIMEOUT_SECONDS = 15


class ConvaiSignedUrlError(Exception):
    """Raised when ElevenLabs rejects the signed-url request or is unreachable."""


def _fetch_signed_url_sync(api_key: str, agent_id: str) -> str:
    query = urllib.parse.urlencode({"agent_id": agent_id})
    request = urllib.request.Request(
        f"{SIGNED_URL_ENDPOINT}?{query}",
        headers={"xi-api-key": api_key},
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            body = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise ConvaiSignedUrlError(f"ElevenLabs returned {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise ConvaiSignedUrlError(f"Could not reach ElevenLabs: {error.reason}") from error

    signed_url = body.get("signed_url")
    if not signed_url:
        raise ConvaiSignedUrlError(f"No signed_url in ElevenLabs response: {body!r}")
    return signed_url


async def get_signed_url(api_key: str, agent_id: str) -> str:
    """Runs the blocking urllib call off the event loop — this endpoint is
    hit once per interview start, not hot-path traffic, so a thread hop is
    simpler than pulling in an async HTTP client for it."""
    return await to_thread(_fetch_signed_url_sync, api_key, agent_id)
