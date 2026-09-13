"""ElevenLabs streaming TTS provider (architecture.md §M).

Not exercised against a real ElevenLabs connection this session — no API
key available in this environment. Implemented against ElevenLabs'
documented WebSocket streaming-input API
(wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input),
behind the same TTSProvider interface as the mock, so swapping providers
needs no changes anywhere else.

Uses the `websockets` library already a dependency for the Deepgram STT
provider (see providers/stt/deepgram.py) rather than adding httpx (a
REST-streaming alternative) as a runtime dependency — httpx is currently
only a dev/test dependency in pyproject.toml.

Requests `output_format=pcm_16000`, so what comes back over the socket is
already raw 16-bit signed little-endian PCM at 16kHz mono — exactly the
wire contract's "pcm_s16le_16000" format (see
interview/schemas.py:InterviewerAudioStartEvent) with no client-side
decoding step and no server-side re-encoding needed.

The `xi-api-key` header is attached server-side only, on this outbound
connection to ElevenLabs — never sent to or visible from the extension
(CLAUDE.md §7).

Manually verify with a real key before relying on this for a demo — see
FEATURE_PROGRESS.md Feature 10.
"""

from __future__ import annotations

import base64
import json
import logging
from collections.abc import AsyncIterator

import websockets

logger = logging.getLogger(__name__)

# Low-latency model suited to short interviewer utterances and hints.
# Not user-configurable yet; promote to a Settings field if a demo needs a
# different voice model.
MODEL_ID = "eleven_turbo_v2_5"


def _stream_url(voice_id: str) -> str:
    return (
        f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input"
        f"?model_id={MODEL_ID}&output_format=pcm_16000"
    )


class ElevenLabsTTSProvider:
    def __init__(self, api_key: str, voice_id: str) -> None:
        self._api_key = api_key
        self._voice_id = voice_id

    async def synthesize(self, text: str) -> AsyncIterator[bytes]:
        async with websockets.connect(
            _stream_url(self._voice_id),
            additional_headers={"xi-api-key": self._api_key},
        ) as connection:
            # BOS (beginning-of-sequence) message per ElevenLabs' streaming
            # protocol, followed by the text itself, followed by an empty
            # "text" message (EOS) that tells the server to flush and close
            # once it has streamed back all remaining audio.
            await connection.send(
                json.dumps(
                    {
                        "text": " ",
                        "voice_settings": {"stability": 0.5, "similarity_boost": 0.8},
                    }
                )
            )
            await connection.send(json.dumps({"text": text}))
            await connection.send(json.dumps({"text": ""}))

            async for raw in connection:
                try:
                    message = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                audio_b64 = message.get("audio")
                if audio_b64:
                    yield base64.b64decode(audio_b64)

                if message.get("isFinal"):
                    break
