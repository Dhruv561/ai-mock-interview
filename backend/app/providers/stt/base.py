"""STT provider interface (architecture.md §H).

A session owns one provider instance for its lifetime: audio chunks are
pushed in via send_audio, and partial/final transcript segments come back
through the on_partial/on_final callbacks passed to start_session — this
mirrors how a real streaming STT connection (e.g. Deepgram) is
bidirectional and asynchronous, so the interface has to be too.
"""

from collections.abc import Awaitable, Callable
from typing import Protocol

OnPartial = Callable[[str], Awaitable[None]]
OnFinal = Callable[[str], Awaitable[None]]


class STTSession(Protocol):
    async def send_audio(self, chunk: bytes) -> None: ...

    async def close(self) -> None: ...


class STTProvider(Protocol):
    async def start_session(self, on_partial: OnPartial, on_final: OnFinal) -> STTSession: ...
