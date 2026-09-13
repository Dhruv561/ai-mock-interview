"""Gemini Live API ephemeral token mint (spike).

Follows the ElevenLabs provider's docstring reasoning (providers/tts/elevenlabs.py):
this repo prefers stdlib urllib over adding httpx as a new runtime dependency for
a single REST call site. Uses asyncio.to_thread to run the blocking call off the
event loop.

The ephemeral token is obtained via a POST to https://generativelanguage.googleapis.com/v1beta/auth_tokens
passing the GEMINI_API_KEY in the x-goog-api-key header. This is a short-lived
credential that the client uses to connect directly to the Gemini Live WebSocket
without exposing the real API key.

References:
- Ephemeral tokens: https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
- WebSocket endpoint: wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
- Token format: access_token query parameter (not a header like with direct API key)
"""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.request

logger = logging.getLogger(__name__)

GEMINI_LIVE_ENDPOINT = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
AUTH_TOKENS_URL = "https://generativelanguage.googleapis.com/v1beta/auth_tokens"


class GeminiLiveTokenError(Exception):
    """Raised when ephemeral token creation fails."""


async def get_ephemeral_token(api_key: str, model: str) -> str:
    """Mint an ephemeral token from the Gemini API.

    Args:
        api_key: GEMINI_API_KEY credential
        model: model name (e.g. "gemini-3.1-flash-live-preview")

    Returns:
        Short-lived access_token string suitable for WebSocket ?access_token= query param

    Raises:
        GeminiLiveTokenError: if token creation fails
    """

    async def _mint_token() -> str:
        body = json.dumps(
            {
                "displayName": "ai-mock-interview-ephemeral-token",
            }
        ).encode("utf-8")

        headers = {
            "x-goog-api-key": api_key,
            "Content-Type": "application/json",
        }

        try:
            request = urllib.request.Request(
                AUTH_TOKENS_URL,
                data=body,
                headers=headers,
                method="POST",
            )

            with urllib.request.urlopen(request, timeout=10) as response:
                data = json.loads(response.read().decode("utf-8"))
                token = data.get("token")
                if not token:
                    raise GeminiLiveTokenError("No 'token' field in response")
                return token
        except urllib.error.URLError as e:
            raise GeminiLiveTokenError(f"Failed to fetch ephemeral token: {e}") from e
        except json.JSONDecodeError as e:
            raise GeminiLiveTokenError(f"Failed to decode token response: {e}") from e
        except Exception as e:
            raise GeminiLiveTokenError(f"Unexpected error fetching ephemeral token: {e}") from e

    return await asyncio.to_thread(_mint_token)


def get_ws_url(token: str) -> str:
    """Build the WebSocket URL with the ephemeral token.

    Args:
        token: ephemeral access_token from get_ephemeral_token()

    Returns:
        Full WebSocket URL ready to connect to
    """
    return f"{GEMINI_LIVE_ENDPOINT}?access_token={token}"
