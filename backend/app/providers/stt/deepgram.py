"""Deepgram streaming STT provider (architecture.md §H).

Not exercised against a real Deepgram connection this session — no API key
available in this environment. Implemented against Deepgram's documented
streaming API (https://developers.deepgram.com/docs/streaming), behind the
same STTProvider interface as the mock, so swapping providers needs no
changes anywhere else. No encoding/sample_rate query params are passed
deliberately: the client sends whatever container MediaRecorder produced
(WebM/Opus, see extension/src/media/microphone.ts), and Deepgram
autodetects the container rather than expecting headerless raw audio.

Manually verify with a real key + mic before relying on this for a demo —
see FEATURE_PROGRESS.md Feature 05.
"""

from __future__ import annotations

import asyncio
import json
import logging

import websockets

from app.providers.stt.base import OnFinal, OnPartial

logger = logging.getLogger(__name__)

DEEPGRAM_STREAM_URL = "wss://api.deepgram.com/v1/listen?punctuate=true&interim_results=true"


class DeepgramSTTSession:
    def __init__(self, connection: websockets.ClientConnection, relay_task: asyncio.Task) -> None:
        self._connection = connection
        self._relay_task = relay_task

    async def send_audio(self, chunk: bytes) -> None:
        await self._connection.send(chunk)

    async def close(self) -> None:
        self._relay_task.cancel()
        # Await the cancellation rather than firing it and moving on —
        # _relay_transcripts already handles CancelledError internally, but
        # without awaiting it here the task's cancellation could still be
        # pending when the event loop later garbage-collects it, which
        # surfaces as a spurious "Task was destroyed but it is pending"
        # warning (Feature 20 cleanup).
        await asyncio.gather(self._relay_task, return_exceptions=True)
        await self._connection.close()


class DeepgramSTTProvider:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def start_session(self, on_partial: OnPartial, on_final: OnFinal) -> DeepgramSTTSession:
        connection = await websockets.connect(
            DEEPGRAM_STREAM_URL,
            additional_headers={"Authorization": f"Token {self._api_key}"},
        )
        relay_task = asyncio.create_task(_relay_transcripts(connection, on_partial, on_final))
        return DeepgramSTTSession(connection, relay_task)


async def _relay_transcripts(
    connection: websockets.ClientConnection, on_partial: OnPartial, on_final: OnFinal
) -> None:
    try:
        async for raw in connection:
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue

            alternatives = message.get("channel", {}).get("alternatives", [])
            if not alternatives:
                continue
            text = alternatives[0].get("transcript", "")
            if not text:
                continue

            if message.get("is_final") or message.get("speech_final"):
                await on_final(text)
            else:
                await on_partial(text)
    except websockets.ConnectionClosed:
        logger.info("Deepgram STT connection closed")
    except asyncio.CancelledError:
        pass
