"""Mock STT provider — the default (USE_MOCK_PROVIDERS=true, or no
DEEPGRAM_API_KEY configured).

Accepts real audio chunks, so the capture/transport pipeline can be
exercised end-to-end without a provider key, but doesn't fabricate
transcripts from them — that would be dishonest, uncontrolled behaviour
that no downstream consumer (rubric, LLM) should ever be evaluating
against. Exercising the transcript.partial/final pipeline without a real
key goes through the dev.simulate_transcript event instead
(architecture.md §G), which is handled directly by the WS layer and
doesn't involve this provider at all.
"""

from app.providers.stt.base import OnFinal, OnPartial


class MockSTTSession:
    def __init__(self) -> None:
        self.chunks_received = 0

    async def send_audio(self, chunk: bytes) -> None:
        self.chunks_received += 1

    async def close(self) -> None:
        pass


class MockSTTProvider:
    async def start_session(self, on_partial: OnPartial, on_final: OnFinal) -> MockSTTSession:
        return MockSTTSession()
