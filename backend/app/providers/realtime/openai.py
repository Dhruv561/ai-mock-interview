"""OpenAI Realtime API ephemeral session token provider (spike: alternative interviewer pipeline).

This module mints short-lived ephemeral credentials for browser clients connecting
to OpenAI's Realtime API directly, bypassing the main interview backend.

Per CLAUDE.md §7, secrets never leak to the client — this runs server-side and
returns only the ephemeral token + connection details.

Uses urllib.request on the event loop (like the ElevenLabs convai spike precedent)
rather than adding httpx as a runtime dependency for a single REST call site.
"""

import asyncio
import json
import urllib.error
import urllib.request
from typing import TypedDict


class OpenAIRealtimeSessionError(Exception):
    """Raised when ephemeral session token minting fails."""
    pass


class EphemeralSessionResponse(TypedDict):
    """Response from OpenAI's ephemeral session endpoint."""
    client_secret: TypedDict(
        "ClientSecret",
        {"value": str, "expires_at": int},
    )
    id: str


async def mint_ephemeral_session(
    api_key: str,
    model: str,
    expires_in: int = 60,  # seconds, max 5 mins per docs
) -> EphemeralSessionResponse:
    """Mint an ephemeral session token for OpenAI Realtime API client connection.

    Args:
        api_key: OpenAI API key
        model: Realtime model ID (e.g., 'gpt-realtime-2.1')
        expires_in: Token lifetime in seconds (max 300)

    Returns:
        EphemeralSessionResponse with client_secret.value + session id

    Raises:
        OpenAIRealtimeSessionError: if the request fails
    """
    if expires_in > 300:
        expires_in = 300

    url = "https://api.openai.com/v1/realtime/sessions"
    body = json.dumps({
        "model": model,
        "voice": "cedar",  # or another voice, per docs
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    def _do_request() -> EphemeralSessionResponse:
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode("utf-8"))
                return data  # type: ignore
        except urllib.error.HTTPError as e:
            raise OpenAIRealtimeSessionError(
                f"Failed to mint ephemeral session: {e.code} {e.reason}"
            ) from e
        except Exception as e:
            raise OpenAIRealtimeSessionError(
                f"Failed to mint ephemeral session: {e}"
            ) from e

    # Run the blocking request off the event loop.
    return await asyncio.to_thread(_do_request)
