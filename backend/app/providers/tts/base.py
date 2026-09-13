"""TTS provider interface (architecture.md §M).

Mirrors the STT provider's small, Protocol-based, async style (see
providers/stt/base.py): given interviewer text, a provider yields raw PCM
audio chunks (16-bit signed little-endian, 16kHz, mono — the wire
contract's "pcm_s16le_16000" format, see interview/schemas.py's
InterviewerAudioStartEvent) as they become available, rather than
buffering the whole clip before returning anything. That lets the caller
start streaming frames to the client as soon as the provider produces the
first byte, instead of waiting for synthesis to finish.

Declared without `async def` in the Protocol on purpose: calling
`synthesize(...)` returns an async iterator immediately (an async
generator object), not a coroutine to await — the same distinction that
makes `async for chunk in provider.synthesize(text): ...` the correct way
to consume it, never `await provider.synthesize(text)`.
"""

from collections.abc import AsyncIterator
from typing import Protocol


class TTSProvider(Protocol):
    def synthesize(self, text: str) -> AsyncIterator[bytes]: ...
