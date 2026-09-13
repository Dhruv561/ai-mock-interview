"""ElevenLabs realtime streaming STT provider (architecture.md §H).

Default STT provider as of 2026-09-13 (swapped from Deepgram — see
FEATURE_PROGRESS.md Feature 05's dated update for the full rationale).
Reuses the same `elevenlabs_api_key` setting as the TTS provider (one
ElevenLabs account key covers both directions).

Not exercised against a real ElevenLabs connection this session — no API
key available in this environment. Implemented against ElevenLabs'
documented realtime STT websocket protocol
(wss://api.elevenlabs.io/v1/speech-to-text/realtime), behind the same
STTProvider interface as Deepgram/mock, so swapping providers needs no
changes anywhere else.

Unlike Deepgram, this endpoint does NOT autodetect an audio container — it
only accepts raw PCM/µ-law samples (`audio_format=pcm_16000` etc.), sent as
base64 inside JSON text frames rather than raw binary WS frames. That is
the reason the extension's mic capture (extension/src/media/microphone.ts)
was changed from MediaRecorder/WebM-Opus to a Web Audio PCM16/16kHz
pipeline alongside this provider — every STT provider now receives the
same raw-PCM wire format, and Deepgram's own query string was updated to
match (encoding=linear16&sample_rate=16000) rather than relying on
container autodetection.

`commit_strategy=vad` is used so ElevenLabs' own voice-activity detection
decides when to finalize a segment (analogous to Deepgram's
`interim_results`/`speech_final`), rather than this backend implementing
its own silence-based commit logic.

Manually verify with a real key + mic before relying on this for a demo —
see FEATURE_PROGRESS.md Feature 05.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging

import websockets

from app.providers.stt.base import OnFinal, OnPartial

logger = logging.getLogger(__name__)

MODEL_ID = "scribe_v2_realtime"

STT_STREAM_URL = (
    "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
    f"?model_id={MODEL_ID}&audio_format=pcm_16000&commit_strategy=vad"
)

# Sample rate of the PCM audio the extension's mic pipeline produces
# (extension/src/media/microphone.ts) — must match the `audio_format` query
# param above.
SAMPLE_RATE = 16000


class ElevenLabsSTTSession:
    def __init__(self, connection: websockets.ClientConnection, relay_task: asyncio.Task) -> None:
        self._connection = connection
        self._relay_task = relay_task

    async def send_audio(self, chunk: bytes) -> None:
        # The realtime endpoint takes JSON text frames with base64 audio,
        # not raw binary frames (unlike Deepgram) — see module docstring.
        await self._connection.send(
            json.dumps(
                {
                    "message_type": "input_audio_chunk",
                    "audio_base_64": base64.b64encode(chunk).decode("ascii"),
                    "sample_rate": SAMPLE_RATE,
                }
            )
        )

    async def close(self) -> None:
        self._relay_task.cancel()
        await self._connection.close()


class ElevenLabsSTTProvider:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def start_session(self, on_partial: OnPartial, on_final: OnFinal) -> ElevenLabsSTTSession:
        connection = await websockets.connect(
            STT_STREAM_URL,
            additional_headers={"xi-api-key": self._api_key},
        )
        relay_task = asyncio.create_task(_relay_transcripts(connection, on_partial, on_final))
        return ElevenLabsSTTSession(connection, relay_task)


async def relay_message(raw: str, on_partial: OnPartial, on_final: OnFinal) -> None:
    """Parses one raw server message and routes it to on_partial/on_final.

    Split out from _relay_transcripts so the message-format logic (the
    part actually worth testing) is directly unit-testable without a real
    or fake websocket connection.
    """
    try:
        message = json.loads(raw)
    except json.JSONDecodeError:
        return

    message_type = message.get("message_type")
    text = message.get("text", "")
    if not text:
        return

    if message_type == "committed_transcript":
        await on_final(text)
    elif message_type == "partial_transcript":
        await on_partial(text)
    # Other message types (session_started, committed_transcript_with_timestamps,
    # committed_transcript_entities, error variants) are ignored here — only
    # plain committed/partial text drives interview state.


async def _relay_transcripts(
    connection: websockets.ClientConnection, on_partial: OnPartial, on_final: OnFinal
) -> None:
    try:
        async for raw in connection:
            await relay_message(raw, on_partial, on_final)
    except websockets.ConnectionClosed:
        logger.info("ElevenLabs STT connection closed")
    except asyncio.CancelledError:
        pass
