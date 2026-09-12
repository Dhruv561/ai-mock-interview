from app.config import Settings
from app.providers.stt import get_stt_provider
from app.providers.stt.deepgram import DeepgramSTTProvider
from app.providers.stt.mock import MockSTTProvider, MockSTTSession


async def _noop(_text: str) -> None:
    pass


async def test_mock_stt_session_counts_chunks():
    session = MockSTTSession()
    await session.send_audio(b"chunk-1")
    await session.send_audio(b"chunk-2")
    assert session.chunks_received == 2
    await session.close()  # must not raise


async def test_mock_stt_provider_starts_a_mock_session():
    provider = MockSTTProvider()
    session = await provider.start_session(_noop, _noop)
    assert isinstance(session, MockSTTSession)


def test_get_stt_provider_returns_mock_when_use_mock_providers_true():
    settings = Settings(use_mock_providers=True, deepgram_api_key="unused-key")
    assert isinstance(get_stt_provider(settings), MockSTTProvider)


def test_get_stt_provider_returns_mock_when_no_deepgram_key():
    settings = Settings(use_mock_providers=False, deepgram_api_key=None)
    assert isinstance(get_stt_provider(settings), MockSTTProvider)


def test_get_stt_provider_returns_deepgram_when_configured():
    settings = Settings(use_mock_providers=False, deepgram_api_key="real-key")
    assert isinstance(get_stt_provider(settings), DeepgramSTTProvider)
